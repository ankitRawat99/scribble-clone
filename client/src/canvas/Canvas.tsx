import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "../socket/socket";
import type { DrawData, Point } from "./drawing.types";
import { clearCanvas, drawLine } from "./drawing.utils";

interface CanvasProps {
  roomId: string;
  roomStatus: "waiting" | "starting" | "playing" | "finished";
  currentDrawerId: string | null;
}

const DEFAULT_COLOR = "#111827";
const DEFAULT_LINE_WIDTH = 4;

function getCanvasPoint(canvas: HTMLCanvasElement, event: React.MouseEvent<HTMLCanvasElement>): Point {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function Canvas({ roomId, roomStatus, currentDrawerId }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const pendingDrawEventsRef = useRef<DrawData[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [lineWidth, setLineWidth] = useState(DEFAULT_LINE_WIDTH);

  const canDraw = roomStatus === "playing" && currentDrawerId === socket.id;

  const flushDrawEvents = useCallback(() => {
    animationFrameRef.current = null;
    const pendingEvents = pendingDrawEventsRef.current.splice(0);

    pendingEvents.forEach((drawData) => {
      socket.emit("draw-line", drawData);
    });
  }, []);

  const queueDrawEvent = useCallback(
    (drawData: DrawData) => {
      pendingDrawEventsRef.current.push(drawData);

      if (animationFrameRef.current === null) {
        animationFrameRef.current = window.requestAnimationFrame(flushDrawEvents);
      }
    },
    [flushDrawEvents]
  );

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
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    clearCanvas(canvas);
  }, [roomId]);

  useEffect(() => {
    const handleRemoteDraw = (drawData: DrawData) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || drawData.roomId !== roomId) return;

      drawLine(ctx, drawData);
    };

    const handleClearCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      clearCanvas(canvas);
    };

    socket.on("draw-line", handleRemoteDraw);
    socket.on("clear-canvas", handleClearCanvas);

    return () => {
      socket.off("draw-line", handleRemoteDraw);
      socket.off("clear-canvas", handleClearCanvas);
    };
  }, [roomId]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canDraw || event.button !== 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    isDrawingRef.current = true;
    lastPointRef.current = getCanvasPoint(canvas, event);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canDraw || !isDrawingRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const previousPoint = lastPointRef.current;
    if (!canvas || !ctx || !previousPoint) return;

    const nextPoint = getCanvasPoint(canvas, event);
    const drawData: DrawData = {
      roomId,
      x: nextPoint.x,
      y: nextPoint.y,
      prevX: previousPoint.x,
      prevY: previousPoint.y,
      color,
      lineWidth,
    };

    drawLine(ctx, drawData);
    queueDrawEvent(drawData);
    lastPointRef.current = nextPoint;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClearCanvas = () => {
    if (!canDraw) return;

    socket.emit("clear-canvas", { roomId });
  };

  return (
    <div className="canvas-shell">
      <div className="canvas-toolbar">
        <div className="canvas-tool-group">
          <label htmlFor="brush-color">Color</label>
          <input
            id="brush-color"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            disabled={!canDraw}
          />
        </div>

        <div className="canvas-tool-group canvas-width-control">
          <label htmlFor="brush-width">Brush</label>
          <input
            id="brush-width"
            type="range"
            min="1"
            max="24"
            value={lineWidth}
            onChange={(event) => setLineWidth(Number(event.target.value))}
            disabled={!canDraw}
          />
          <span>{lineWidth}px</span>
        </div>

        <button
          type="button"
          className="ui-button ui-button-ghost"
          onClick={handleClearCanvas}
          disabled={!canDraw}
        >
          Clear Canvas
        </button>
      </div>

      <div className="canvas-status">
        {canDraw ? "You are drawing" : "Watching the current drawer"}
      </div>

      <canvas
        ref={canvasRef}
        className={`drawing-canvas ${canDraw ? "can-draw" : "view-only"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
      />
    </div>
  );
}

export default Canvas;
