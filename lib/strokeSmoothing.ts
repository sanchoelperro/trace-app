import type { Point } from "./geometry";

/** Slider range for "Stroke smoothing" (0 = off). */
export const MAX_SMOOTHING = 10;

/**
 * Strongest smoothing weight we allow (at slider = MAX_SMOOTHING).
 * WHY 0.8: each new point moves the pen 20% of the way toward the pointer.
 * With 60-120 input events per second this trails the finger by only a few
 * tens of milliseconds, which steadies jitter without feeling laggy.
 */
const MAX_WEIGHT = 0.8;

/**
 * Input stabilizer: an exponential moving average over pointer positions.
 *
 * Every raw point pulls the smoothed "pen tip" part of the way toward it.
 * Small, fast wobbles (hand tremor, finger jitter) mostly cancel out, while
 * deliberate movement still gets through. Strength 0 returns raw points.
 *
 * The stabilized line lags slightly behind the pointer, so the engine draws
 * the final segment straight to the exact lift-off point.
 */
export class Stabilizer {
  private readonly weight: number;
  private current: Point;

  /** @param strength slider value, 0..MAX_SMOOTHING */
  constructor(strength: number, start: Point) {
    const clamped = Math.min(Math.max(strength, 0), MAX_SMOOTHING);
    this.weight = (clamped / MAX_SMOOTHING) * MAX_WEIGHT;
    this.current = start;
  }

  /** Feed one raw pointer position; returns the smoothed position. */
  next(raw: Point): Point {
    const keep = this.weight; // how much of the old position to keep
    this.current = {
      x: this.current.x * keep + raw.x * (1 - keep),
      y: this.current.y * keep + raw.y * (1 - keep),
    };
    return this.current;
  }
}
