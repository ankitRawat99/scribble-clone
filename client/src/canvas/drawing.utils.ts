import type { CanvasAction, DrawData, StrokeData } from "./drawing.types";
import { floodFill } from "./fill";

/** The canvas background color — used as eraser paint color */
export const CANVAS_BG = "#f8fafc";

/**
 * Draws a single line segment on the canvas.
 *
 * Eraser architecture: instead of using destination-out composite (which creates
 * transparency rather than white), the eraser simply draws with the canvas background
 * color. This means it travels through the SAME socket event path as brush strokes,
 * requires no special server handling, and syncs perfectly across all clients.
 */
export function drawLine(ctx: CanvasRenderingContext2D, drawData: DrawData): void {
  ctx.beginPath();
  ctx.moveTo(drawData.prevX, drawData.prevY);
  ctx.lineTo(drawData.x, drawData.y);
  // Eraser draws with canvas BG color — visually "erases" without composite ops
  ctx.strokeStyle = drawData.tool === "eraser" ? CANVAS_BG : drawData.color;
  ctx.lineWidth = drawData.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

/**
 * Clears the canvas to the background color.
 * Uses fillRect instead of clearRect to maintain an opaque white background
 * (needed for the eraser color-match technique to work correctly).
 */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * Replays a full stroke history onto the canvas.
 *
 * This is the core of the undo architecture: instead of storing pixel snapshots
 * (expensive — ~800KB per ImageData at 1080p), we store strokes as coordinate arrays.
 * Undo = pop last action → clear → replay remaining. Also enables reconnect sync.
 *
 * BUG 1 FIX: Points are stored in CSS-pixel coordinates. The canvas context has a
 * DPR transform applied (ctx.setTransform(dpr, 0, 0, dpr, 0, 0)), so we must NOT
 * multiply by DPR here — the transform does it automatically. Previous code multiplied
 * by DPR, causing double-scaling on Retina displays.
 */
export function replayStrokes(canvas: HTMLCanvasElement, strokes: StrokeData[]): void {
  clearCanvas(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;

    const paintColor = stroke.tool === "eraser" ? CANVAS_BG : stroke.color;

    ctx.beginPath();
    ctx.strokeStyle = paintColor;
    ctx.lineWidth = stroke.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }
}

/**
 * Replays a unified canvas action history onto the canvas.
 *
 * BUG 3 FIX: This function replaces the old replayStrokes-for-reconnect flow.
 * Previously strokes and fills were replayed from separate arrays (out of order).
 * Now we iterate a single chronological array:
 * - "stroke" actions → draw the stroke path
 * - "fill" actions → run floodFill() at the stored seed point
 *
 * Order matters: if user drew Stroke A → Fill B → Stroke C, the fill must be
 * applied between the two strokes, not after all strokes.
 */
export function replayHistory(canvas: HTMLCanvasElement, actions: CanvasAction[]): void {
  clearCanvas(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  for (const action of actions) {
    if (action.type === "stroke") {
      const stroke = action.stroke;
      if (stroke.points.length < 2) continue;

      const paintColor = stroke.tool === "eraser" ? CANVAS_BG : stroke.color;

      ctx.beginPath();
      ctx.strokeStyle = paintColor;
      ctx.lineWidth = stroke.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    } else if (action.type === "fill") {
      const fill = action.fill;
      floodFill(ctx, fill.x, fill.y, fill.color);
    }
  }
}
