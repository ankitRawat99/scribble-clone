export interface Point {
  x: number;
  y: number;
}

/**
 * Tool types supported by the canvas engine.
 * - "brush": standard stroke drawing
 * - "eraser": draws with canvas background color (#f8fafc) — same socket path as brush
 * - "fill": flood-fill operation from a seed point
 */
export type DrawTool = "brush" | "eraser" | "fill";

/**
 * DrawData is the payload for each mouse-move segment during drawing/erasing.
 * The "tool" field lets all clients render the correct visual effect.
 * Eraser uses the same event — just with a special color override.
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
 * A single point within a stroke, recorded for history replay.
 */
export interface StrokePoint {
  x: number;
  y: number;
}

/**
 * A complete stroke record — this is what gets stored in canvas history.
 * Points are accumulated as the user draws; committed on mouseUp.
 * History-based storage enables undo and reconnect replay.
 */
export interface StrokeData {
  id: string;
  tool: DrawTool;
  color: string;
  lineWidth: number;
  points: StrokePoint[];
}

/**
 * FillData is the payload for a flood-fill (bucket) operation.
 * The server broadcasts {x, y, color} to all clients.
 * Each client runs its own flood-fill independently from the same seed — no pixel data sent.
 */
export interface FillData {
  roomId: string;
  x: number;
  y: number;
  color: string;
}

/**
 * Sent by the drawer to undo their last canvas action.
 * Server removes the last CanvasAction entry and broadcasts updated history.
 */
export interface UndoData {
  roomId: string;
}

/**
 * Unified Canvas Action — discriminated union for the single ordered history.
 * Replaces the old separate strokeHistory + fillHistory arrays.
 */
export type CanvasAction =
  | { type: "stroke"; stroke: StrokeData }
  | { type: "fill"; fill: FillData };
