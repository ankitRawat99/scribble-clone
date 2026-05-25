import { Server, Socket } from "socket.io";
import * as roomManager from "../rooms/roomManager";
import { CanvasAction, DrawData, FillData, StrokeData, UndoData } from "../types/drawing.types";

/**
 * Server-side canvas history store.
 *
 * BUG 3 FIX — UNIFIED HISTORY ARCHITECTURE:
 * Previously, strokes and fills were stored in separate Maps:
 *   strokeHistoryByRoom: Map<string, StrokeData[]>
 *   fillHistoryByRoom:   Map<string, FillData[]>
 *
 * This caused two bugs:
 * 1. Undo (history.pop()) only removed strokes — fills could never be undone.
 * 2. Reconnect replay sent all strokes first, then all fills, regardless of
 *    actual chronological order. If user drew Stroke→Fill→Stroke, reconnecting
 *    clients saw Stroke→Stroke→Fill — producing a different visual.
 *
 * NEW: Single ordered array of CanvasAction (discriminated union).
 * Each entry is either { type: "stroke", stroke: StrokeData }
 * or { type: "fill", fill: FillData }. Undo pops the last action regardless
 * of type. Reconnect replays the full array in correct order.
 */
const canvasHistoryByRoom = new Map<string, CanvasAction[]>();

/** Clear all canvas state for a room (called on turn end / clear-canvas). */
export function clearRoomCanvasHistory(roomId: string): void {
  canvasHistoryByRoom.set(roomId, []);
}

/** Remove a room's canvas history entirely (called when room is deleted). */
export function deleteRoomCanvasHistory(roomId: string): void {
  canvasHistoryByRoom.delete(roomId);
}

function ensureHistory(roomId: string): CanvasAction[] {
  let history = canvasHistoryByRoom.get(roomId);
  if (!history) {
    history = [];
    canvasHistoryByRoom.set(roomId, history);
  }
  return history;
}

// ────────────────────────────────────────────────────────────────
// Validation helpers
// ────────────────────────────────────────────────────────────────

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidHexColor(value: string): boolean {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function validateDrawData(data: DrawData): { valid: boolean; error?: string } {
  if (!data || typeof data.roomId !== "string" || data.roomId.trim().length === 0) {
    return { valid: false, error: "Invalid drawing room" };
  }
  if (
    !isFiniteNumber(data.x) ||
    !isFiniteNumber(data.y) ||
    !isFiniteNumber(data.prevX) ||
    !isFiniteNumber(data.prevY)
  ) {
    return { valid: false, error: "Invalid drawing coordinates" };
  }
  if (!isValidHexColor(data.color)) {
    return { valid: false, error: "Invalid drawing color" };
  }
  if (!isFiniteNumber(data.lineWidth) || data.lineWidth < 1 || data.lineWidth > 40) {
    return { valid: false, error: "Invalid drawing line width" };
  }
  const validTools = ["brush", "eraser", "fill"];
  if (!validTools.includes(data.tool)) {
    return { valid: false, error: "Invalid drawing tool" };
  }
  return { valid: true };
}

function validateFillData(data: FillData): { valid: boolean; error?: string } {
  if (!data || typeof data.roomId !== "string" || data.roomId.trim().length === 0) {
    return { valid: false, error: "Invalid fill room" };
  }
  if (!isFiniteNumber(data.x) || !isFiniteNumber(data.y)) {
    return { valid: false, error: "Invalid fill coordinates" };
  }
  if (!isValidHexColor(data.color)) {
    return { valid: false, error: "Invalid fill color" };
  }
  return { valid: true };
}

// ────────────────────────────────────────────────────────────────
// Socket handler registration
// ────────────────────────────────────────────────────────────────

/**
 * Registers realtime drawing socket handlers.
 *
 * Multiplayer synchronization flow:
 *   draw-line:     drawer emits → server validates → broadcasts to OTHER clients in room
 *   draw-batch:    drawer emits array of segments → server validates once → broadcasts array
 *   stroke-commit: drawer emits completed stroke → server appends to unified history
 *   fill-canvas:   drawer emits seed+color → server appends to history → broadcasts to ALL
 *   canvas-undo:   drawer emits → server pops last action → broadcasts full history to room
 *   clear-canvas:  drawer emits → server clears history → broadcasts to ALL in room
 *   request-canvas-history: joining client emits → server sends full unified history
 */
export function registerDrawingHandlers(io: Server, socket: Socket): void {

  /**
   * draw-line: Real-time stroke segment broadcast.
   * The drawer's client renders locally first (local-first architecture for zero lag),
   * then emits. Server validates and relays to other clients ONLY (socket.to).
   * The drawer does NOT receive their own draw-line events back.
   */
  socket.on("draw-line", (data: DrawData) => {
    const dataValidation = validateDrawData(data);
    if (!dataValidation.valid) {
      socket.emit("room-error", { message: dataValidation.error });
      return;
    }

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room || room.id !== data.roomId) return;

    const drawValidation = roomManager.validatePlayerCanDraw(data.roomId, socket.id);
    if (!drawValidation.valid) return;

    // Relay to all other clients in the room
    socket.to(data.roomId).emit("draw-line", data);
  });

  /**
   * draw-batch: Batched draw segments (PERFORMANCE OPTIMIZATION).
   * Client accumulates draw events during a rAF window and sends them as a single array.
   * Server validates once, broadcasts the full array to other clients.
   * This reduces socket event overhead by ~10x during fast drawing.
   */
  socket.on("draw-batch", (data: { roomId: string; segments: DrawData[] }) => {
    if (!data?.roomId || !Array.isArray(data.segments) || data.segments.length === 0) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room || room.id !== data.roomId) return;

    const drawValidation = roomManager.validatePlayerCanDraw(data.roomId, socket.id);
    if (!drawValidation.valid) return;

    // Cap batch size to prevent abuse
    const segments = data.segments.slice(0, 100);

    // Relay the full batch to other clients
    socket.to(data.roomId).emit("draw-batch", { roomId: data.roomId, segments });
  });

  /**
   * stroke-commit: Called when the drawer lifts the mouse (mouseUp / touchEnd).
   * The completed stroke is appended to the unified canvas history.
   */
  socket.on("stroke-commit", (data: { roomId: string; stroke: StrokeData }) => {
    if (!data?.roomId || !data?.stroke) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room || room.id !== data.roomId) return;

    const drawValidation = roomManager.validatePlayerCanDraw(data.roomId, socket.id);
    if (!drawValidation.valid) return;

    const stroke = data.stroke;
    if (!stroke.id || !stroke.points || stroke.points.length === 0) return;

    const history = ensureHistory(data.roomId);
    history.push({ type: "stroke", stroke });
  });

  /**
   * fill-canvas: Bucket fill tool.
   *
   * The fill is stored in the UNIFIED history (not a separate array), so:
   * - Undo can pop fills (not just strokes)
   * - Reconnect replays fills in correct chronological order
   *
   * Broadcasts to ALL clients (including drawer) — drawer waits for this event.
   */
  socket.on("fill-canvas", (data: FillData) => {
    const fillValidation = validateFillData(data);
    if (!fillValidation.valid) {
      socket.emit("room-error", { message: fillValidation.error });
      return;
    }

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room || room.id !== data.roomId) return;

    const drawValidation = roomManager.validatePlayerCanDraw(data.roomId, socket.id);
    if (!drawValidation.valid) {
      socket.emit("room-error", { message: drawValidation.error });
      return;
    }

    // Store fill in UNIFIED history
    const history = ensureHistory(data.roomId);
    history.push({ type: "fill", fill: data });

    // Broadcast to ALL clients including the drawer
    io.to(data.roomId).emit("fill-canvas", data);
  });

  /**
   * canvas-undo: Drawer undoes their last canvas action.
   *
   * Pops the last CanvasAction from the unified history — could be a stroke OR a fill.
   * Broadcasts the full canonical history to all clients who clear + replay.
   */
  socket.on("canvas-undo", (data: UndoData) => {
    if (!data?.roomId) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room || room.id !== data.roomId) return;

    const drawValidation = roomManager.validatePlayerCanDraw(data.roomId, socket.id);
    if (!drawValidation.valid) return;

    const history = ensureHistory(data.roomId);
    if (history.length === 0) return;

    // Pop the last action (stroke OR fill)
    history.pop();

    // Broadcast canonical history to ALL clients — they clear + replay
    io.to(data.roomId).emit("canvas-history", { actions: history });
  });

  /**
   * clear-canvas: Clears the canvas and resets all history.
   */
  socket.on("clear-canvas", (payload: { roomId: string }) => {
    const roomId = payload?.roomId;
    if (typeof roomId !== "string") {
      socket.emit("room-error", { message: "Invalid room" });
      return;
    }

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room || room.id !== roomId) return;

    const clearValidation = roomManager.validatePlayerCanClearCanvas(roomId, socket.id);
    if (!clearValidation.valid) {
      socket.emit("room-error", { message: clearValidation.error });
      return;
    }

    clearRoomCanvasHistory(roomId);
    io.to(roomId).emit("clear-canvas");
  });

  /**
   * request-canvas-history: Called by a reconnecting/joining client.
   * Sends the unified canvas history so they can replay to current state.
   */
  socket.on("request-canvas-history", (payload: { roomId: string }) => {
    const roomId = payload?.roomId;
    if (typeof roomId !== "string") return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room || room.id !== roomId) return;

    const history = canvasHistoryByRoom.get(roomId) ?? [];
    socket.emit("canvas-history", { actions: history });
  });
}
