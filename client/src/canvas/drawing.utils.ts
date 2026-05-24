import type { DrawData } from "./drawing.types";

export function drawLine(ctx: CanvasRenderingContext2D, drawData: DrawData): void {
  ctx.beginPath();
  ctx.moveTo(drawData.prevX, drawData.prevY);
  ctx.lineTo(drawData.x, drawData.y);
  ctx.strokeStyle = drawData.color;
  ctx.lineWidth = drawData.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

export function clearCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
