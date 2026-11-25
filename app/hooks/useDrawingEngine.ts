import { useEffect, useRef, type RefObject } from "react";
import type { Point, Rect } from "@/lib/geometry";
import { StrokeRenderer } from "@/lib/strokeRenderer";
import { Stabilizer } from "@/lib/strokeSmoothing";

export type DrawMode = "pen" | "eraser";

export interface DrawingSettings {
  mode: DrawMode;
  lineWidth: number;
  eraserWidth: number;
  /** Stroke smoothing strength, 0 (off) .. MAX_SMOOTHING. */
  smoothing: number;
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
function toCanvasPoint(
  canvas: HTMLCanvasElement,
  rect: DOMRect,
  clientX: number,
  clientY: number
): Point {
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
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
function coalescedPositions(e: PointerEvent): { clientX: number; clientY: number }[] {
  if (typeof e.getCoalescedEvents === "function") {
    const events = e.getCoalescedEvents();
    if (events.length > 0) return events;
  }
  return [e];
}

/** State of the stroke currently being drawn (null when idle). */
interface ActiveStroke {
  pointerId: number;
  renderer: StrokeRenderer;
  stabilizer: Stabilizer;
  /** Raw points received since the last animation frame. */
  pending: Point[];
}

/**
 * Freehand drawing on the given canvas with native pointer listeners.
 *
 * IMPORTANT DESIGN DECISION: listeners are attached with addEventListener
 * exactly once, not as React JSX props (onPointerDown etc.). On iPad Safari,
 * re-renders caused by zoom changes were breaking touch input when the
 * handlers were React props. Attaching natively also lets us pass
 * { passive: false } so preventDefault() reliably blocks scrolling/gestures.
 * Everything the listeners read that can change goes through refs.
 *
 * PERFORMANCE: pointer events only queue points; actual drawing happens at
 * most once per screen refresh in a requestAnimationFrame callback, and only
 * the new part of the stroke is drawn (see StrokeRenderer).
 *
 * @param onStrokeCommit called after a stroke finishes with the area it
 *        changed (used to record an undo step). Not called for a plain tap.
 */
export function useDrawingEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  settings: DrawingSettings,
  onStrokeCommit: (changed: Rect) => void
): void {
  const settingsRef = useLatestRef(settings);
  const onStrokeCommitRef = useLatestRef(onStrokeCommit);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let stroke: ActiveStroke | null = null;
    let frameId: number | null = null;

    /** Smooth and draw every queued point. Safe to call at any time. */
    const flushPending = () => {
      if (!stroke || stroke.pending.length === 0) return;
      const s = stroke;
      const smoothed = s.pending.map((p) => s.stabilizer.next(p));
      s.pending = [];
      s.renderer.addPoints(smoothed);
    };

    const onFrame = () => {
      frameId = null;
      flushPending();
    };

    const scheduleFrame = () => {
      if (frameId === null) frameId = requestAnimationFrame(onFrame);
    };

    const cancelFrame = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      // Ignore extra pointers while a stroke is in progress (e.g. a second
      // finger). Multi-touch gestures are handled in a later phase.
      if (stroke) return;

      // Keep receiving move/up events even if the pointer leaves the canvas.
      canvas.setPointerCapture(e.pointerId);

      // Settings are read once per stroke, so a stroke is consistent even if
      // a slider changes mid-stroke.
      const current = settingsRef.current;
      const start = toCanvasPoint(canvas, canvas.getBoundingClientRect(), e.clientX, e.clientY);
      const erase = current.mode === "eraser";

      stroke = {
        pointerId: e.pointerId,
        renderer: new StrokeRenderer(
          ctx,
          { erase, width: erase ? current.eraserWidth : current.lineWidth },
          start
        ),
        stabilizer: new Stabilizer(current.smoothing, start),
        pending: [],
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!stroke || e.pointerId !== stroke.pointerId) return;
      e.preventDefault();

      // One layout read per event (not per coalesced sample). Reading it
      // fresh keeps positions correct if the page scrolled during a stroke.
      const rect = canvas.getBoundingClientRect();
      for (const sample of coalescedPositions(e)) {
        stroke.pending.push(toCanvasPoint(canvas, rect, sample.clientX, sample.clientY));
      }
      scheduleFrame();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!stroke || e.pointerId !== stroke.pointerId) return;

      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }

      // Draw everything still queued right now instead of waiting a frame,
      // then end the line exactly where the pointer lifted.
      cancelFrame();
      flushPending();
      const end = toCanvasPoint(canvas, canvas.getBoundingClientRect(), e.clientX, e.clientY);
      stroke.renderer.finish(end);

      const changed = stroke.renderer.drewSomething ? stroke.renderer.dirtyRect() : null;
      stroke = null;
      if (changed) onStrokeCommitRef.current(changed);
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
  }, [canvasRef, settingsRef, onStrokeCommitRef]);
}
