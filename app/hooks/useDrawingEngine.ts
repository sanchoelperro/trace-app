import { useEffect, useRef, type RefObject } from "react";

export type DrawMode = "pen" | "eraser";

export interface DrawingSettings {
  mode: DrawMode;
  lineWidth: number;
  eraserWidth: number;
}

/** A point in canvas pixel coordinates (not CSS pixels). */
interface CanvasPoint {
  x: number;
  y: number;
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
 * Convert a pointer event's screen position to canvas pixel coordinates.
 * The canvas is displayed scaled by CSS (zoom/fit), so its on-screen size
 * differs from its pixel size; this ratio undoes that scaling.
 */
function toCanvasPoint(canvas: HTMLCanvasElement, e: PointerEvent): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

/** Set pen or eraser styling on the context for the current mode. */
function applyToolStyle(ctx: CanvasRenderingContext2D, settings: DrawingSettings): void {
  if (settings.mode === "eraser") {
    // destination-out removes existing pixels instead of painting new ones.
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = settings.eraserWidth;
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = settings.lineWidth;
    ctx.strokeStyle = "black";
  }
  ctx.lineCap = "round";
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
 * @param onStrokeStart called right before a stroke begins (used to save an
 *        undo snapshot).
 */
export function useDrawingEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  settings: DrawingSettings,
  onStrokeStart: () => void
): void {
  const modeRef = useLatestRef(settings.mode);
  const lineWidthRef = useLatestRef(settings.lineWidth);
  const eraserWidthRef = useLatestRef(settings.eraserWidth);
  const onStrokeStartRef = useLatestRef(onStrokeStart);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isDrawing = false;

    const currentSettings = (): DrawingSettings => ({
      mode: modeRef.current,
      lineWidth: lineWidthRef.current,
      eraserWidth: eraserWidthRef.current,
    });

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Keep receiving move/up events even if the pointer leaves the canvas.
      canvas.setPointerCapture(e.pointerId);
      onStrokeStartRef.current();

      const { x, y } = toCanvasPoint(canvas, e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      isDrawing = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawing) return;
      e.preventDefault();

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { x, y } = toCanvasPoint(canvas, e);
      applyToolStyle(ctx, currentSettings());
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      isDrawing = false;
    };

    // passive: false is required so preventDefault() inside these
    // listeners reliably blocks scrolling/gesture behavior on iOS Safari.
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointercancel", onPointerUp, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
    // All dependencies are refs (stable identities), so this runs once.
  }, [canvasRef, modeRef, lineWidthRef, eraserWidthRef, onStrokeStartRef]);
}
