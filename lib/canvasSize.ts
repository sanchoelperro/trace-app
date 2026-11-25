import type { Size } from "./printLayout";

/**
 * Longest side, in pixels, for the reference and drawing canvases.
 *
 * WHY 3300: US Letter is 11in on its long side; 11in x 300dpi = 3300px, so
 * a capped canvas still prints at full 300 dpi quality. Phone photos are
 * often 4000-8000px; above roughly 16.7 million pixels iOS Safari silently
 * refuses to create the canvas, and big canvases make every pixel operation
 * (undo, export, auto-trace) slower and hungrier for memory.
 */
export const MAX_CANVAS_LONG_SIDE = 3300;

/**
 * Scale a size down (never up) so its longest side is at most `maxLongSide`,
 * keeping the aspect ratio. Results are whole pixels.
 */
export function capToLongSide(size: Size, maxLongSide: number = MAX_CANVAS_LONG_SIDE): Size {
  const longSide = Math.max(size.width, size.height);
  if (longSide <= maxLongSide) return { width: size.width, height: size.height };

  const scale = maxLongSide / longSide;
  return {
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
  };
}
