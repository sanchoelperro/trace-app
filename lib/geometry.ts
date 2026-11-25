// Small geometry helpers shared by the drawing engine and undo history.

export interface Point {
  x: number;
  y: number;
}

/** An integer pixel rectangle on a canvas. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The whole canvas as a Rect. */
export function fullRect(canvas: { width: number; height: number }): Rect {
  return { x: 0, y: 0, width: canvas.width, height: canvas.height };
}

/**
 * Grows a bounding box as points are added, then turns it into a padded
 * integer Rect clipped to the canvas. Used to find which pixels a stroke
 * touched, so undo only has to store that area.
 */
export class BoundsTracker {
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  add(p: Point): void {
    this.minX = Math.min(this.minX, p.x);
    this.minY = Math.min(this.minY, p.y);
    this.maxX = Math.max(this.maxX, p.x);
    this.maxY = Math.max(this.maxY, p.y);
  }

  /**
   * @param padding extra pixels on every side (half the line width plus a
   *        little for anti-aliasing), because a line is wider than its points.
   * @returns null if no points were added or the box lies outside the canvas.
   */
  toRect(padding: number, canvasWidth: number, canvasHeight: number): Rect | null {
    if (this.minX === Infinity) return null;

    // floor/ceil so the rect fully covers partially-touched edge pixels.
    const x = Math.max(0, Math.floor(this.minX - padding));
    const y = Math.max(0, Math.floor(this.minY - padding));
    const right = Math.min(canvasWidth, Math.ceil(this.maxX + padding));
    const bottom = Math.min(canvasHeight, Math.ceil(this.maxY + padding));

    if (right <= x || bottom <= y) return null;
    return { x, y, width: right - x, height: bottom - y };
  }
}
