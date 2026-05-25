/**
 * fill.ts — Scanline Flood Fill Algorithm
 *
 * ARCHITECTURE REASONING:
 * Fill operations are O(px) — up to ~300k pixel checks per click.
 * We do NOT run this on the server. Instead:
 *   1. Drawer clicks → emit fill-canvas { x, y, color }  (~60 bytes)
 *   2. Server validates + broadcasts to room
 *   3. Every client (including drawer) runs this function independently
 *
 * This keeps server payload tiny and CPU-free. All clients converge on the
 * same result because they share the same canvas state + seed point + fill color.
 *
 * ALGORITHM: Scanline (iterative, not recursive)
 * Recursive flood-fill overflows the call stack for large regions (~10k+ pixels).
 * The scanline approach uses a stack of horizontal spans — much more memory-efficient
 * and 5-10x faster than pixel-by-pixel recursion.
 *
 * TOLERANCE: Anti-aliased edges create sub-pixel color variations. We use a
 * tolerance of 32 (per channel) to fill through slightly-different-colored edges.
 *
 * SAFETY CAP: MAX_PIXELS prevents browser freeze on accidental full-canvas fills.
 */

const FILL_TOLERANCE = 32;
const MAX_PIXELS = 500_000; // Safety cap: abort if fill exceeds this

function colorMatch(
  data: Uint8ClampedArray,
  idx: number,
  r: number,
  g: number,
  b: number,
  a: number
): boolean {
  return (
    Math.abs(data[idx] - r) <= FILL_TOLERANCE &&
    Math.abs(data[idx + 1] - g) <= FILL_TOLERANCE &&
    Math.abs(data[idx + 2] - b) <= FILL_TOLERANCE &&
    Math.abs(data[idx + 3] - a) <= FILL_TOLERANCE
  );
}

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
    255,
  ];
}

/**
 * Performs a scanline flood-fill on the given canvas context.
 *
 * IMPORTANT — DPR handling:
 * The canvas context may have a DPR transform applied (ctx.setTransform(dpr,...)).
 * getImageData/putImageData work on the RAW bitmap, not the transformed space.
 * So we:
 *   1. Save the current transform
 *   2. Reset to identity for getImageData/putImageData
 *   3. Restore after
 *
 * Coordinates:
 *   startX/startY are CSS pixels → we multiply by DPR to get bitmap positions.
 *
 * @param ctx - The 2D rendering context of the canvas
 * @param startX - Seed X coordinate (CSS pixels)
 * @param startY - Seed Y coordinate (CSS pixels)
 * @param fillHex - Fill color as hex string (e.g. "#22c55e")
 */
export function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillHex: string
): void {
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;

  // Convert CSS pixel coordinates to actual canvas bitmap pixel coordinates
  const px = Math.round(startX * dpr);
  const py = Math.round(startY * dpr);
  const w = canvas.width;
  const h = canvas.height;

  console.log("[floodFill] Input:", { startX, startY, dpr, px, py, w, h, fillHex });

  if (px < 0 || py < 0 || px >= w || py >= h) {
    console.warn("[floodFill] Coordinates out of bounds:", { px, py, w, h });
    return;
  }

  // Reset transform to identity for getImageData/putImageData
  // These methods work on the raw bitmap and should not be affected by transforms,
  // but we reset to be safe across all browser implementations.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Sample the target color at seed point
  const seedIdx = (py * w + px) * 4;
  const targetR = data[seedIdx];
  const targetG = data[seedIdx + 1];
  const targetB = data[seedIdx + 2];
  const targetA = data[seedIdx + 3];

  const [fillR, fillG, fillB, fillA] = hexToRgba(fillHex);

  console.log("[floodFill] Colors sampled:", {
    targetRGBA: [targetR, targetG, targetB, targetA],
    fillRGBA: [fillR, fillG, fillB, fillA],
    FILL_TOLERANCE
  });

  // If seed color already matches fill color, nothing to do
  if (
    Math.abs(targetR - fillR) <= FILL_TOLERANCE &&
    Math.abs(targetG - fillG) <= FILL_TOLERANCE &&
    Math.abs(targetB - fillB) <= FILL_TOLERANCE &&
    Math.abs(targetA - fillA) <= FILL_TOLERANCE
  ) {
    console.log("[floodFill] Seed color matches fill color. Aborting.");
    ctx.restore();
    return;
  }

  /**
   * Standard scanline flood-fill:
   * Stack entries are [y, startX] — we scan left and right from startX to find
   * the full horizontal span, paint it, then push child rows above and below.
   */
  const stack: Array<[number, number]> = [[py, px]];
  const visited = new Uint8Array(w * h);
  let pixelCount = 0;

  function matchesTarget(x: number, y: number): boolean {
    const pos = y * w + x;
    if (visited[pos]) return false;
    return colorMatch(data, pos * 4, targetR, targetG, targetB, targetA);
  }

  function paintPixel(x: number, y: number): void {
    const pos = y * w + x;
    const idx = pos * 4;
    data[idx] = fillR;
    data[idx + 1] = fillG;
    data[idx + 2] = fillB;
    data[idx + 3] = fillA;
    visited[pos] = 1;
    pixelCount++;
  }

  while (stack.length > 0) {
    if (pixelCount >= MAX_PIXELS) {
      console.warn("[floodFill] Max pixels safety cap reached:", MAX_PIXELS);
      break; // Safety cap
    }

    const [y, seedX] = stack.pop()!;
    if (y < 0 || y >= h) continue;
    if (!matchesTarget(seedX, y)) continue;

    // Find leftmost matching pixel in this row
    let left = seedX;
    while (left > 0 && matchesTarget(left - 1, y)) left--;

    // Find rightmost matching pixel in this row
    let right = seedX;
    while (right < w - 1 && matchesTarget(right + 1, y)) right++;

    // Paint the entire span
    for (let x = left; x <= right; x++) {
      paintPixel(x, y);
    }

    // Push child spans on rows above and below
    // We scan for contiguous matching segments to avoid pushing duplicate entries
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;

      let inSpan = false;
      for (let x = left; x <= right; x++) {
        if (matchesTarget(x, ny)) {
          if (!inSpan) {
            // Start of a new child span — push its seed point
            stack.push([ny, x]);
            inSpan = true;
          }
        } else {
          inSpan = false;
        }
      }
    }
  }

  console.log("[floodFill] Fill complete. Total pixels painted:", pixelCount);
  ctx.putImageData(imageData, 0, 0);
  ctx.restore(); // Restore the DPR transform
}
