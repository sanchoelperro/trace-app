import { distance, midpoint, type Point } from "./geometry";

/**
 * Two-finger pan + pinch-zoom math. Pure functions, no DOM.
 *
 * MODEL: when the second finger goes down we remember which point of the
 * PICTURE (in canvas pixels) lies under the midpoint of the two fingers: the
 * "anchor". On every frame afterwards we choose a zoom from how far apart the
 * fingers are, then scroll so the anchor sits under the CURRENT midpoint.
 * Moving both fingers together therefore pans; spreading them zooms around
 * the spot between them; doing both at once works naturally.
 */

/**
 * The fingers must change their distance by more than this fraction before
 * zooming starts. Without it, a "pure" two-finger pan would also zoom
 * slightly, because fingers never keep exactly the same distance.
 */
const PINCH_START_THRESHOLD = 0.06;

export interface GestureState {
  /** Picture point (canvas pixels) that stays under the fingers' midpoint. */
  anchor: Point;
  /** Zoom when the pinch (re)started. */
  baseZoom: number;
  /** Finger distance (CSS px) when the pinch (re)started. */
  baseDistance: number;
  /** False until the fingers have spread/closed past the threshold. */
  zoomEngaged: boolean;
}

export interface GestureFrame {
  zoom: number;
  /** Where (screen coordinates) the anchor should appear. */
  midpoint: Point;
}

/** Start a gesture from two finger positions in client (screen) coordinates. */
export function startGesture(a: Point, b: Point, anchor: Point, currentZoom: number): GestureState {
  return {
    anchor,
    baseZoom: currentZoom,
    // Guard against division by zero if both touches report the same spot.
    baseDistance: Math.max(distance(a, b), 1),
    zoomEngaged: false,
  };
}

/**
 * Compute the zoom and target midpoint for the current finger positions.
 * May update `state` (when zooming engages), hence it is passed by reference.
 */
export function gestureFrame(state: GestureState, a: Point, b: Point): GestureFrame {
  const dist = Math.max(distance(a, b), 1);

  if (!state.zoomEngaged && Math.abs(dist / state.baseDistance - 1) > PINCH_START_THRESHOLD) {
    // Re-base on the current distance so zoom grows smoothly from here
    // instead of jumping by the threshold amount.
    state.zoomEngaged = true;
    state.baseDistance = dist;
  }

  const zoom = state.zoomEngaged ? state.baseZoom * (dist / state.baseDistance) : state.baseZoom;
  return { zoom, midpoint: midpoint(a, b) };
}
