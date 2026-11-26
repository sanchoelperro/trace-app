import { useEffect, useRef, type RefObject } from "react";
import type { Point, Rect } from "@/lib/geometry";
import { StrokeRenderer } from "@/lib/strokeRenderer";
import { Stabilizer } from "@/lib/strokeSmoothing";
import { gestureFrame, startGesture, type GestureState } from "@/lib/twoFingerGesture";
import type { ZoomAnchor } from "./useZoom";

export type DrawMode = "pen" | "eraser";

export interface DrawingSettings {
  mode: DrawMode;
  lineWidth: number;
  eraserWidth: number;
  /** Stroke smoothing strength, 0 (off) .. MAX_SMOOTHING. */
  smoothing: number;
}

export interface DrawingCallbacks {
  /** A stroke finished; `changed` is the area it touched (record an undo step). */
  onStrokeCommit: (changed: Rect) => void;
  /** A stroke was abandoned; restore `changed` to its state before the stroke. */
  onStrokeCancel: (changed: Rect) => void;
  /** Two-finger gesture: zoom to `zoom` keeping the anchor under the fingers. */
  onGestureZoom: (zoom: number, anchor: ZoomAnchor) => void;
}

/**
 * Keep a ref in sync with the latest value of a prop/state.
 *
 * WHY: the pointer listeners below are attached once and live across all
 * re-renders. A closure would only ever see the value from the render in
 * which it was created; a ref always holds the current value.
 */
function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

/**
 * Convert screen coordinates to canvas pixel coordinates.
 * The canvas is displayed scaled by CSS (zoom/fit), so its on-screen size
 * differs from its pixel size; this ratio undoes that scaling.
 */
function toCanvasPoint(canvas: HTMLCanvasElement, rect: DOMRect, client: Point): Point {
  return {
    x: (client.x - rect.left) * (canvas.width / rect.width),
    y: (client.y - rect.top) * (canvas.height / rect.height),
  };
}

function clientPoint(e: { clientX: number; clientY: number }): Point {
  return { x: e.clientX, y: e.clientY };
}

/**
 * All input positions carried by one pointermove event.
 *
 * Browsers deliver at most one pointermove per frame but may sample the
 * finger/pen more often; getCoalescedEvents() returns those extra samples,
 * giving smoother curves on fast strokes. It is missing in older Safari
 * (added in iOS 18.2), so we feature-detect and fall back to the event itself.
 * Early implementations lacked pointerId/target on coalesced events, so we
 * only read clientX/clientY from them.
 */
function coalescedPositions(e: PointerEvent): Point[] {
  if (typeof e.getCoalescedEvents === "function") {
    const events = e.getCoalescedEvents();
    if (events.length > 0) return events.map(clientPoint);
  }
  return [clientPoint(e)];
}

/** The stroke currently being drawn. */
interface ActiveStroke {
  pointerId: number;
  pointerType: string;
  renderer: StrokeRenderer;
  stabilizer: Stabilizer;
  /** Raw canvas points received since the last animation frame. */
  pending: Point[];
}

/**
 * What the engine is doing right now:
 *  - idle:        nothing pressed
 *  - drawing:     one pointer is drawing a stroke
 *  - gesture:     two fingers are panning/zooming
 *  - waitRelease: a gesture ended but a finger is still down; it must NOT
 *                 start drawing (that would leave a stray mark), so we wait
 *                 until all fingers lift (or a second finger re-pinches).
 */
type Phase =
  | { kind: "idle" }
  | { kind: "drawing"; stroke: ActiveStroke }
  | { kind: "gesture"; ids: [number, number]; state: GestureState; dirty: boolean }
  | { kind: "waitRelease" };

/**
 * Pointer input for the drawing canvas: drawing with one pointer, and
 * two-finger pan / pinch-zoom on touch screens.
 *
 * IMPORTANT DESIGN DECISION: listeners are attached with addEventListener
 * exactly once, not as React JSX props (onPointerDown etc.). On iPad Safari,
 * re-renders caused by zoom changes were breaking touch input when the
 * handlers were React props (and pinch-zoom re-renders every frame).
 * Attaching natively also lets us pass { passive: false } so
 * preventDefault() reliably blocks scrolling/gestures. Everything the
 * listeners read that can change goes through refs.
 *
 * PERFORMANCE: pointer events only record positions; drawing and gesture
 * updates happen at most once per screen refresh (requestAnimationFrame).
 *
 * INPUT RULES: mouse and pen always draw (a palm touching the screen while
 * a pen draws is ignored). A second FINGER while one finger draws cancels
 * that stroke (as if it never happened) and starts a pan/zoom gesture.
 */
export function useDrawingEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  settings: DrawingSettings,
  callbacks: DrawingCallbacks
): void {
  const settingsRef = useLatestRef(settings);
  const callbacksRef = useLatestRef(callbacks);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let phase: Phase = { kind: "idle" };
    /** Current screen position of every finger on the canvas (touch only). */
    const touches = new Map<number, Point>();
    let frameId: number | null = null;

    // ---- animation-frame batching -------------------------------------

    /** Smooth and draw every queued stroke point. */
    const flushStroke = (stroke: ActiveStroke) => {
      if (stroke.pending.length === 0) return;
      const smoothed = stroke.pending.map((p) => stroke.stabilizer.next(p));
      stroke.pending = [];
      stroke.renderer.addPoints(smoothed);
    };

    /** Apply the latest finger positions to zoom/scroll. */
    const flushGesture = (g: Extract<Phase, { kind: "gesture" }>) => {
      if (!g.dirty) return;
      g.dirty = false;
      const a = touches.get(g.ids[0]);
      const b = touches.get(g.ids[1]);
      if (!a || !b) return;

      const frame = gestureFrame(g.state, a, b);
      callbacksRef.current.onGestureZoom(frame.zoom, {
        canvasX: g.state.anchor.x,
        canvasY: g.state.anchor.y,
        clientX: frame.midpoint.x,
        clientY: frame.midpoint.y,
      });
    };

    const onFrame = () => {
      frameId = null;
      if (phase.kind === "drawing") flushStroke(phase.stroke);
      else if (phase.kind === "gesture") flushGesture(phase);
    };

    const scheduleFrame = () => {
      if (frameId === null) frameId = requestAnimationFrame(onFrame);
    };

    const cancelFrame = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    };

    // ---- phase transitions --------------------------------------------

    const beginStroke = (e: PointerEvent) => {
      // Settings are read once per stroke, so a stroke is consistent even if
      // a slider changes mid-stroke.
      const s = settingsRef.current;
      const start = toCanvasPoint(canvas, canvas.getBoundingClientRect(), clientPoint(e));
      const erase = s.mode === "eraser";
      phase = {
        kind: "drawing",
        stroke: {
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          renderer: new StrokeRenderer(ctx, { erase, width: erase ? s.eraserWidth : s.lineWidth }, start),
          stabilizer: new Stabilizer(s.smoothing, start),
          pending: [],
        },
      };
    };

    /** Finish the stroke and hand its changed area to the undo history. */
    const commitStroke = (stroke: ActiveStroke, end: Point) => {
      cancelFrame();
      flushStroke(stroke); // draw what's still queued right now, not next frame
      stroke.renderer.finish(toCanvasPoint(canvas, canvas.getBoundingClientRect(), end));
      const changed = stroke.renderer.drewSomething ? stroke.renderer.dirtyRect() : null;
      if (changed) callbacksRef.current.onStrokeCommit(changed);
    };

    /** Throw the stroke away: restore its pixels, record no undo step. */
    const cancelStroke = (stroke: ActiveStroke) => {
      cancelFrame();
      stroke.pending = [];
      const changed = stroke.renderer.dirtyRect();
      if (changed) callbacksRef.current.onStrokeCancel(changed);
    };

    /** Start pan/zoom with the first two fingers currently down. */
    const beginGesture = () => {
      const [idA, idB] = Array.from(touches.keys());
      const a = touches.get(idA)!;
      const b = touches.get(idB)!;
      const rect = canvas.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // The on-screen width per canvas pixel IS the current zoom.
      const currentZoom = rect.width / canvas.width;
      phase = {
        kind: "gesture",
        ids: [idA, idB],
        state: startGesture(a, b, toCanvasPoint(canvas, rect, mid), currentZoom),
        dirty: false,
      };
    };

    // ---- event handlers -----------------------------------------------

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      // Keep receiving move/up events even if the pointer leaves the canvas.
      canvas.setPointerCapture(e.pointerId);
      const isTouch = e.pointerType === "touch";
      if (isTouch) touches.set(e.pointerId, clientPoint(e));

      switch (phase.kind) {
        case "idle":
          beginStroke(e);
          break;
        case "drawing":
          // Only a second FINGER during a FINGER stroke becomes a gesture.
          // Touches during a pen/mouse stroke (e.g. a resting palm) are ignored.
          if (isTouch && phase.stroke.pointerType === "touch" && touches.size >= 2) {
            cancelStroke(phase.stroke);
            beginGesture();
          }
          break;
        case "gesture":
          break; // a third finger is ignored
        case "waitRelease":
          if (!isTouch) {
            // A mouse/pen press while fingers linger: draw with it.
            beginStroke(e);
          } else if (touches.size >= 2) {
            beginGesture(); // the lingering finger plus a new one: pinch again
          }
          break;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" && touches.has(e.pointerId)) {
        touches.set(e.pointerId, clientPoint(e));
      }

      if (phase.kind === "drawing" && e.pointerId === phase.stroke.pointerId) {
        e.preventDefault();
        // One layout read per event (not per coalesced sample). Reading it
        // fresh keeps positions correct if the view scrolled during a stroke.
        const rect = canvas.getBoundingClientRect();
        for (const p of coalescedPositions(e)) {
          phase.stroke.pending.push(toCanvasPoint(canvas, rect, p));
        }
        scheduleFrame();
      } else if (phase.kind === "gesture" && phase.ids.includes(e.pointerId)) {
        e.preventDefault();
        phase.dirty = true;
        scheduleFrame();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }

      if (phase.kind === "drawing" && e.pointerId === phase.stroke.pointerId) {
        // pointercancel also commits (same as before this phase): whatever
        // was drawn stays and can be undone.
        commitStroke(phase.stroke, clientPoint(e));
        phase = touches.size > 0 ? { kind: "waitRelease" } : { kind: "idle" };
      } else if (phase.kind === "gesture" && phase.ids.includes(e.pointerId)) {
        cancelFrame();
        phase = touches.size > 0 ? { kind: "waitRelease" } : { kind: "idle" };
      } else if (phase.kind === "waitRelease" && touches.size === 0) {
        phase = { kind: "idle" };
      }
    };

    // passive: false is required so preventDefault() inside these
    // listeners reliably blocks scrolling/gesture behavior on iOS Safari.
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointercancel", onPointerUp, { passive: false });

    return () => {
      cancelFrame();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
    // All dependencies are refs (stable identities), so this runs once.
  }, [canvasRef, settingsRef, callbacksRef]);
}
