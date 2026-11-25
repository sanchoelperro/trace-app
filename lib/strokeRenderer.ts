import { BoundsTracker, distance, midpoint, type Point, type Rect } from "./geometry";

export interface StrokeStyle {
  /** "eraser" removes pixels instead of painting black. */
  erase: boolean;
  width: number;
}

/**
 * Points closer than this (canvas pixels) to the previous one are skipped.
 * They add no visible detail but cost draw calls and can make tiny kinks.
 */
const MIN_POINT_DISTANCE = 0.75;

/**
 * Draws ONE stroke incrementally as smooth curves.
 *
 * HOW THE CURVE WORKS (quadratic midpoint smoothing):
 * For input points p0, p1, p2, ... we don't connect the points directly
 * (that gives a jagged polyline). Instead each piece runs from the midpoint
 * of (p[i-1], p[i]) to the midpoint of (p[i], p[i+1]), bending toward p[i]
 * as its control point. Neighbouring pieces meet at midpoints with the same
 * direction, so the line has no corners.
 *
 * WHY INCREMENTAL: each call draws only the NEW pieces, starting where the
 * previous call ended (`lastEnd`). The old code re-stroked the entire,
 * ever-growing path on every pointer move, so long strokes got slower and
 * slower. Here the cost per frame depends only on how many new points came in.
 */
export class StrokeRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly style: StrokeStyle;
  private readonly bounds = new BoundsTracker();
  /** Last accepted input point: control point of the next curve piece. */
  private prev: Point;
  /** Where the drawn line currently ends (a midpoint, or the start). */
  private lastEnd: Point;
  private hasDrawn = false;

  constructor(ctx: CanvasRenderingContext2D, style: StrokeStyle, start: Point) {
    this.ctx = ctx;
    this.style = style;
    this.prev = start;
    this.lastEnd = start;
    this.bounds.add(start);
  }

  /** True once anything has been painted (or erased). */
  get drewSomething(): boolean {
    return this.hasDrawn;
  }

  /** Draw curve pieces for a batch of new points with a single stroke() call. */
  addPoints(points: readonly Point[]): void {
    const ctx = this.ctx;
    let started = false;

    for (const p of points) {
      if (distance(p, this.prev) < MIN_POINT_DISTANCE) continue;

      if (!started) {
        this.applyStyle();
        ctx.beginPath();
        ctx.moveTo(this.lastEnd.x, this.lastEnd.y);
        started = true;
      }

      const mid = midpoint(this.prev, p);
      ctx.quadraticCurveTo(this.prev.x, this.prev.y, mid.x, mid.y);
      this.lastEnd = mid;
      this.prev = p;
      this.bounds.add(p);
    }

    if (started) {
      ctx.stroke();
      this.hasDrawn = true;
    }
  }

  /**
   * Draw the last piece so the line ends EXACTLY at `end` (where the pointer
   * lifted), even if smoothing made the drawn line trail behind it.
   * A tap with no movement draws nothing, as before.
   */
  finish(end: Point): void {
    if (!this.hasDrawn && distance(end, this.lastEnd) < MIN_POINT_DISTANCE) return;

    const ctx = this.ctx;
    this.applyStyle();
    ctx.beginPath();
    ctx.moveTo(this.lastEnd.x, this.lastEnd.y);
    ctx.quadraticCurveTo(this.prev.x, this.prev.y, end.x, end.y);
    ctx.stroke();

    this.bounds.add(end);
    this.hasDrawn = true;
  }

  /**
   * Pixels this stroke may have changed. A quadratic curve always stays
   * inside the triangle of its points, so the points' bounding box plus
   * half the line width covers everything. +2 px covers anti-aliasing.
   */
  dirtyRect(): Rect | null {
    const canvas = this.ctx.canvas;
    return this.bounds.toRect(this.style.width / 2 + 2, canvas.width, canvas.height);
  }

  private applyStyle(): void {
    const ctx = this.ctx;
    // destination-out removes existing pixels instead of painting new ones.
    ctx.globalCompositeOperation = this.style.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = "black";
    ctx.lineWidth = this.style.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
}
