export interface Point {
  x: number;
  y: number;
}

/**
 * Tool types supported by the canvas engine.
 * - "brush": standard stroke drawing
 * - "eraser": draws with canvas background color (#f8fafc) — same draw-line event as brush
 * - "fill": flood-fill operation from a seed click point
 */
export type DrawTool = "brush" | "eraser" | "fill";

/**
 * DrawData is the payload for each mouse-move segment.
 * tool field lets all clients apply the correct rendering.
 */
export interface DrawData {
  roomId: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  color: string;
  lineWidth: number;
  tool: DrawTool;
}

/**
 * A single stroke — accumulated during mouseDown→mouseUp.
 * Stored in canvas history for replay-based undo.
 */
export interface StrokeData {
  id: string;
  tool: DrawTool;
  color: string;
  lineWidth: number;
  points: Point[];
}

/**
 * FillData for the bucket fill tool.
 * Only seed point + color sent over the wire — each client runs its own flood-fill.
 */
export interface FillData {
  roomId: string;
  x: number;
  y: number;
  color: string;
}

/**
 * BUG 3 FIX — Unified Canvas Action
 *
 * Previously strokes and fills were stored in separate arrays. This caused:
 * 1. Undo only popped strokes — fills could never be undone
 * 2. Reconnect replay was out-of-order: all strokes first, then all fills,
 *    regardless of the actual chronological interleaving
 *
 * Now both action types live in a SINGLE ordered array. Each action is a
 * discriminated union — undo pops the last one regardless of type, and
 * reconnect replays the full array in correct chronological order.
 */
export type CanvasAction =
  | { type: "stroke"; stroke: StrokeData }
  | { type: "fill"; fill: FillData };
