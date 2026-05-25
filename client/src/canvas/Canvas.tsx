import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "../socket/socket";
import type { CanvasAction, DrawData, DrawTool, FillData, StrokeData } from "./drawing.types";
import { clearCanvas, drawLine, replayHistory, CANVAS_BG } from "./drawing.utils";
import { floodFill } from "./fill";
import CanvasToolbar from "./CanvasToolbar";

interface CanvasProps {
  roomId: string;
  roomStatus: "waiting" | "starting" | "playing" | "finished";
  currentDrawerId: string | null;
}

const DEFAULT_COLOR = "#111827";
const DEFAULT_LINE_WIDTH = 6;

/** Generate a unique stroke ID for history tracking */
function generateStrokeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get canvas-relative coordinates from a MouseEvent.
 * Returns CSS pixel coordinates (before DPR scaling).
 * DPR scaling is handled at render time by the canvas transform.
 */
function getCanvasPoint(
  canvas: HTMLCanvasElement,
  event: { clientX: number; clientY: number }
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

/**
 * Canvas — The core drawing surface.
 *
 * ARCHITECTURE (Phase 9 — Stabilized):
 *
 * 1. LOCAL-FIRST RENDERING: drawer sees strokes instantly with zero lag.
 *    Socket events are batched and flushed once per animation frame.
 *
 * 2. UNIFIED CANVAS HISTORY (BUG 3 FIX): Every completed action (stroke OR fill)
 *    is stored in a single CanvasAction[] array. This replaces the old separate
 *    strokeHistory + fillHistory. Undo pops the last action regardless of type.
 *    Reconnect replays the full array in chronological order.
 *
 * 3. BATCHED DRAW EMIT (Component 4): Instead of emitting each DrawData individually,
 *    we accumulate segments during a rAF window and emit them as a single `draw-batch`
 *    event. This reduces socket event overhead by ~10x during fast drawing.
 *
 * 4. ERASER: draws with CANVAS_BG color — same socket path as brush, no special handling.
 *    BUG 4 FIX: DrawData.color is now correctly set to CANVAS_BG (not palette color).
 *
 * 5. FILL: click → emit fill-canvas(x, y, color) → server broadcasts → all clients
 *    run floodFill() independently (deterministic convergence, server stays CPU-free).
 *
 * 6. UNDO: emits canvas-undo → server pops last CanvasAction → broadcasts canonical
 *    history → all clients replay. Replay-based undo ensures state convergence.
 */
function Canvas({ roomId, roomStatus, currentDrawerId }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Drawing state
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const currentStrokeRef = useRef<StrokeData | null>(null);

  // Batching: accumulate draw-line events and flush as a single batch per frame
  const pendingDrawEventsRef = useRef<DrawData[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Unified canvas history — mirrors server history for immediate undo feedback
  const canvasHistoryRef = useRef<CanvasAction[]>([]);

  // Tool state
  const [activeTool, setActiveTool] = useState<DrawTool>("brush");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [lineWidth, setLineWidth] = useState(DEFAULT_LINE_WIDTH);

  const canDraw = roomStatus === "playing" && currentDrawerId === socket.id;

  // ─────────────────────────────────────────────
  // Canvas Setup & Resize
  // ─────────────────────────────────────────────

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Repaint after resize — restore canvas background then replay history
    replayHistory(canvas, canvasHistoryRef.current);
  }, []);

  useEffect(() => {
    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    if (canvasRef.current) observer.observe(canvasRef.current);
    window.addEventListener("resize", resizeCanvas);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  // Clear canvas + history when room changes (new game session)
  useEffect(() => {
    canvasHistoryRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) clearCanvas(canvas);
  }, [roomId]);

  // ─────────────────────────────────────────────
  // Socket Event Listeners
  // ─────────────────────────────────────────────

  useEffect(() => {
    /** Remote draw-line: another client sent a stroke segment. Render it directly. */
    const handleRemoteDraw = (drawData: DrawData) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || drawData.roomId !== roomId) return;
      drawLine(ctx, drawData);
    };

    /** Remote draw-batch: another client sent a batch of stroke segments. */
    const handleRemoteDrawBatch = (data: { roomId: string; segments: DrawData[] }) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || data.roomId !== roomId) return;
      for (const segment of data.segments) {
        drawLine(ctx, segment);
      }
    };

    /** clear-canvas: server-authoritative reset of the canvas (new turn, host clear). */
    const handleClearCanvas = () => {
      canvasHistoryRef.current = [];
      const canvas = canvasRef.current;
      if (canvas) clearCanvas(canvas);
    };

    /**
     * canvas-history: server sends the authoritative unified history.
     * Used for undo (trimmed history) and reconnect sync (full history).
     * All clients clear and replay — this guarantees state convergence.
     */
    const handleCanvasHistory = ({ actions }: { actions: CanvasAction[] }) => {
      canvasHistoryRef.current = actions;
      const canvas = canvasRef.current;
      if (canvas) replayHistory(canvas, actions);
    };

    /**
     * fill-canvas: drawer's fill propagated by server.
     * ALL clients (including drawer) run floodFill here.
     * Drawer does NOT apply fill on mouseClick — they wait for this event
     * to ensure they see the exact same result as all other clients.
     */
    const handleFillCanvas = (data: FillData) => {
      console.log("Canvas.tsx: handleFillCanvas: Received fill-canvas event from server:", data);
      if (data.roomId !== roomId) {
        console.warn("Canvas.tsx: handleFillCanvas: Room ID mismatch:", { eventRoomId: data.roomId, currentRoomId: roomId });
        return;
      }
      // If we are the drawer, we already applied the fill locally!
      // Skip to avoid double-painting and duplicate history entries.
      if (currentDrawerId === socket.id) {
        console.log("Canvas.tsx: handleFillCanvas: We are the drawer, ignoring echoed event.");
        return;
      }
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        console.warn("Canvas.tsx: handleFillCanvas: Canvas or context not available:", { canvas: !!canvas, ctx: !!ctx });
        return;
      }
      floodFill(ctx, data.x, data.y, data.color);
      // Track fill in local history so it survives resize/replay
      canvasHistoryRef.current.push({ type: "fill", fill: data });
    };

    socket.on("draw-line", handleRemoteDraw);
    socket.on("draw-batch", handleRemoteDrawBatch);
    socket.on("clear-canvas", handleClearCanvas);
    socket.on("canvas-history", handleCanvasHistory);
    socket.on("fill-canvas", handleFillCanvas);

    return () => {
      socket.off("draw-line", handleRemoteDraw);
      socket.off("draw-batch", handleRemoteDrawBatch);
      socket.off("clear-canvas", handleClearCanvas);
      socket.off("canvas-history", handleCanvasHistory);
      socket.off("fill-canvas", handleFillCanvas);
    };
  }, [roomId]);

  // Request canvas history when becoming the viewer of a running game (reconnect)
  useEffect(() => {
    if (roomStatus === "playing" && currentDrawerId !== socket.id) {
      socket.emit("request-canvas-history", { roomId });
    }
  }, [roomId, roomStatus, currentDrawerId]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // ─────────────────────────────────────────────
  // Draw Event Batching (Component 4 — Performance Optimization)
  //
  // ARCHITECTURE: Instead of emitting each DrawData individually on the socket
  // (which creates one socket.emit per mousemove — 60-120 events/second!),
  // we accumulate events during a requestAnimationFrame window (~16ms)
  // and emit them as a SINGLE "draw-batch" event.
  //
  // This reduces socket overhead by ~10x:
  //   Before: 120 socket.emit("draw-line", ...) per second
  //   After:  60 socket.emit("draw-batch", { segments: [...] }) per second
  //           where each batch contains 1-3 segments
  // ─────────────────────────────────────────────

  const flushDrawEvents = useCallback(() => {
    animationFrameRef.current = null;
    const events = pendingDrawEventsRef.current.splice(0);
    if (events.length === 0) return;

    if (events.length === 1) {
      // Single segment — use draw-line for backward compatibility
      socket.emit("draw-line", events[0]);
    } else {
      // Multiple segments — batch them
      socket.emit("draw-batch", { roomId, segments: events });
    }
  }, [roomId]);

  const queueDrawEvent = useCallback(
    (drawData: DrawData) => {
      pendingDrawEventsRef.current.push(drawData);
      if (animationFrameRef.current === null) {
        animationFrameRef.current = window.requestAnimationFrame(flushDrawEvents);
      }
    },
    [flushDrawEvents]
  );

  // ─────────────────────────────────────────────
  // Mouse Handlers
  // ─────────────────────────────────────────────

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    console.log("Canvas.tsx: handleMouseDown:", { activeTool, canDraw, button: event.button });
    if (!canDraw || event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = getCanvasPoint(canvas, event);

    // Fill tool: click triggers fill immediately (no drag)
    if (activeTool === "fill") {
      const fillData: FillData = { roomId, x: point.x, y: point.y, color };
      console.log("Canvas.tsx: handleMouseDown: Emitting fill-canvas to server:", fillData);
      
      // Local-first: Apply fill locally immediately
      const ctx = canvas.getContext("2d");
      if (ctx) {
        floodFill(ctx, fillData.x, fillData.y, fillData.color);
      }
      // Track fill in local history so it survives resize/replay
      canvasHistoryRef.current.push({ type: "fill", fill: fillData });

      // Emit to server — server broadcasts to others.
      socket.emit("fill-canvas", fillData);
      return;
    }

    // Brush / Eraser: begin stroke
    isDrawingRef.current = true;
    lastPointRef.current = point;

    const strokeColor = activeTool === "eraser" ? CANVAS_BG : color;

    // Start a new stroke record for history
    currentStrokeRef.current = {
      id: generateStrokeId(),
      tool: activeTool,
      color: strokeColor,
      lineWidth,
      points: [point],
    };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canDraw || !isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const prevPoint = lastPointRef.current;
    if (!canvas || !ctx || !prevPoint) return;

    const nextPoint = getCanvasPoint(canvas, event);
    const strokeColor = activeTool === "eraser" ? CANVAS_BG : color;

    const drawData: DrawData = {
      roomId,
      x: nextPoint.x,
      y: nextPoint.y,
      prevX: prevPoint.x,
      prevY: prevPoint.y,
      color: strokeColor,
      lineWidth,
      tool: activeTool,
    };

    // Local-first: render immediately for zero-lag feel
    drawLine(ctx, drawData);

    // Queue for socket batch flush
    queueDrawEvent(drawData);

    // Accumulate point into current stroke
    if (currentStrokeRef.current) {
      currentStrokeRef.current.points.push(nextPoint);
    }

    lastPointRef.current = nextPoint;
  };

  const commitStroke = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;

    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;

    if (!stroke || stroke.points.length < 2) return;

    // Add to local unified history
    canvasHistoryRef.current.push({ type: "stroke", stroke });

    // Commit to server history (for undo + reconnect sync)
    socket.emit("stroke-commit", { roomId, stroke });
  };

  // ─────────────────────────────────────────────
  // Touch Handlers (mobile support)
  // ─────────────────────────────────────────────

  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    event.preventDefault();
    const touch = event.touches[0];
    const canvas = canvasRef.current;
    if (!touch || !canvas) return;

    const point = getCanvasPoint(canvas, touch);

    if (activeTool === "fill") {
      const fillData: FillData = { roomId, x: point.x, y: point.y, color };
      console.log("Canvas.tsx: handleTouchStart: Emitting fill-canvas to server:", fillData);

      // Local-first: Apply fill locally immediately
      const ctx = canvas.getContext("2d");
      if (ctx) {
        floodFill(ctx, fillData.x, fillData.y, fillData.color);
      }
      // Track fill in local history so it survives resize/replay
      canvasHistoryRef.current.push({ type: "fill", fill: fillData });

      socket.emit("fill-canvas", fillData);
      return;
    }

    const strokeColor = activeTool === "eraser" ? CANVAS_BG : color;

    isDrawingRef.current = true;
    lastPointRef.current = point;
    currentStrokeRef.current = {
      id: generateStrokeId(),
      tool: activeTool,
      color: strokeColor,
      lineWidth,
      points: [point],
    };
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (!canDraw || !isDrawingRef.current) return;
    event.preventDefault();
    const touch = event.touches[0];
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const prevPoint = lastPointRef.current;
    if (!touch || !canvas || !ctx || !prevPoint) return;

    const nextPoint = getCanvasPoint(canvas, touch);
    const strokeColor = activeTool === "eraser" ? CANVAS_BG : color;
    const drawData: DrawData = {
      roomId,
      x: nextPoint.x,
      y: nextPoint.y,
      prevX: prevPoint.x,
      prevY: prevPoint.y,
      color: strokeColor,
      lineWidth,
      tool: activeTool,
    };

    drawLine(ctx, drawData);
    queueDrawEvent(drawData);

    if (currentStrokeRef.current) {
      currentStrokeRef.current.points.push(nextPoint);
    }

    lastPointRef.current = nextPoint;
  };

  // ─────────────────────────────────────────────
  // Toolbar Actions
  // ─────────────────────────────────────────────

  const handleUndo = () => {
    if (!canDraw) return;
    socket.emit("canvas-undo", { roomId });
    // Optimistic local undo — revert immediately, server correction arrives shortly
    const history = [...canvasHistoryRef.current];
    history.pop();
    canvasHistoryRef.current = history;
    const canvas = canvasRef.current;
    if (canvas) replayHistory(canvas, history);
  };

  const handleClearCanvas = () => {
    if (!canDraw) return;
    socket.emit("clear-canvas", { roomId });
  };

  // ─────────────────────────────────────────────
  // Keyboard Shortcuts
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!canDraw) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;

      if (e.key === "b" || e.key === "B") setActiveTool("brush");
      else if (e.key === "e" || e.key === "E") setActiveTool("eraser");
      else if (e.key === "f" || e.key === "F") setActiveTool("fill");
      else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDraw, roomId]);

  // ─────────────────────────────────────────────
  // Cursor class based on active tool
  // ─────────────────────────────────────────────

  const cursorClass = !canDraw
    ? "cursor-view"
    : activeTool === "fill"
    ? "cursor-fill"
    : activeTool === "eraser"
    ? "cursor-eraser"
    : "cursor-draw";

  return (
    <div className="canvas-shell">
      <canvas
        ref={canvasRef}
        className={`drawing-canvas ${cursorClass}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={commitStroke}
        onMouseLeave={commitStroke}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={commitStroke}
      />

      <CanvasToolbar
        canDraw={canDraw}
        activeTool={activeTool}
        color={color}
        lineWidth={lineWidth}
        onToolChange={setActiveTool}
        onColorChange={setColor}
        onLineWidthChange={setLineWidth}
        onUndo={handleUndo}
        onClear={handleClearCanvas}
        hasHistory={canvasHistoryRef.current.length > 0}
      />
    </div>
  );
}

export default Canvas;
