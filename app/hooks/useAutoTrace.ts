import { useEffect, useRef, useState, type RefObject } from "react";
import { DEFAULT_TRACE_PARAMS, REFERENCE_LONG_SIDE, type AutoTraceParams } from "@/lib/autoTrace";
import { AutoTraceClient } from "@/lib/autoTraceClient";
import { capToLongSide } from "@/lib/canvasSize";
import type { Rect } from "@/lib/geometry";

/** The preview is computed on a copy of the photo this big (long side). */
const PREVIEW_LONG_SIDE = REFERENCE_LONG_SIDE;

/** Wait this long after the last slider change before recomputing the preview. */
const PREVIEW_DEBOUNCE_MS = 250;

/**
 * Preview lines are tinted blue (Tailwind blue-600) so they are easy to tell
 * apart from lines already drawn. Apply always draws black.
 */
const PREVIEW_RGB: [number, number, number] = [37, 99, 235];

export type AutoTraceStatus = "idle" | "previewing" | "applying";

export interface AutoTraceControls {
  isOpen: boolean;
  params: AutoTraceParams;
  setParams: (params: AutoTraceParams) => void;
  status: AutoTraceStatus;
  error: string | null;
  open: () => void;
  cancel: () => void;
  apply: () => Promise<void>;
}

interface AutoTraceArgs {
  imageCanvasRef: RefObject<HTMLCanvasElement | null>;
  drawCanvasRef: RefObject<HTMLCanvasElement | null>;
  previewCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Called after lines were drawn into `changed` (record ONE undo step). */
  onApplied: (changed: Rect) => void;
}

/** Copy a canvas's pixels, scaled down so the long side is at most `maxLongSide`. */
function readScaledPixels(source: HTMLCanvasElement, maxLongSide: number): ImageData | null {
  const size = capToLongSide({ width: source.width, height: source.height }, maxLongSide);
  const tmp = document.createElement("canvas");
  tmp.width = size.width;
  tmp.height = size.height;
  const ctx = tmp.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return ctx.getImageData(0, 0, size.width, size.height);
}

/** Recolour black trace pixels for the preview (alpha is left alone). */
function tint(image: ImageData, [r, g, b]: [number, number, number]): void {
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}

/**
 * Auto-Trace workflow: open -> live preview while sliders move -> Apply or Cancel.
 *
 * - The preview runs on a ~1000 px copy and is drawn on a separate preview
 *   canvas layered over the drawing; the drawing canvas is not touched.
 * - Apply traces the full-resolution reference image, then draws the lines
 *   on top of the existing drawing (source-over keeps existing marks) and
 *   reports the changed area, so ONE Undo removes the whole auto-trace.
 */
export function useAutoTrace(args: AutoTraceArgs): AutoTraceControls {
  const { imageCanvasRef, drawCanvasRef, previewCanvasRef, onApplied } = args;
  const [isOpen, setIsOpen] = useState(false);
  const [params, setParams] = useState<AutoTraceParams>(DEFAULT_TRACE_PARAMS);
  const [status, setStatus] = useState<AutoTraceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<AutoTraceClient | null>(null);
  const previewSourceRef = useRef<ImageData | null>(null);
  /** Increments per preview request; replies with an older id are stale. */
  const previewIdRef = useRef(0);

  const getClient = (): AutoTraceClient => {
    clientRef.current ??= new AutoTraceClient(); // created on first use only
    return clientRef.current;
  };

  // Stop the worker when the page goes away.
  useEffect(() => {
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, []);

  // Debounced live preview: re-run whenever the panel is open and params change.
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      const source = previewSourceRef.current;
      const preview = previewCanvasRef.current;
      const drawCanvas = drawCanvasRef.current;
      if (!source || !preview || !drawCanvas) return;

      const id = ++previewIdRef.current;
      setStatus("previewing");
      try {
        // Send a copy: the buffer is transferred and the original is kept
        // for the next slider change.
        const copy = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
        const result = await getClient().trace(copy, params, drawCanvas.width / source.width);
        if (id !== previewIdRef.current) return; // a newer preview (or cancel) superseded this

        const ctx = preview.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, preview.width, preview.height);
        if (result.image && result.bounds) {
          tint(result.image, PREVIEW_RGB);
          ctx.putImageData(result.image, result.bounds.x, result.bounds.y);
        }
        setStatus("idle");
      } catch (err) {
        if (id === previewIdRef.current) {
          setError(String(err));
          setStatus("idle");
        }
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isOpen, params, previewCanvasRef, drawCanvasRef]);

  const open = () => {
    const imageCanvas = imageCanvasRef.current;
    const preview = previewCanvasRef.current;
    if (!imageCanvas || !preview) return;

    const source = readScaledPixels(imageCanvas, PREVIEW_LONG_SIDE);
    if (!source) return;
    previewSourceRef.current = source;
    // Preview canvas pixels match the downscaled copy; CSS stretches it over the drawing.
    preview.width = source.width;
    preview.height = source.height;
    setError(null);
    setIsOpen(true);
  };

  const cancel = () => {
    previewIdRef.current++; // invalidate any preview still running
    previewSourceRef.current = null;
    const preview = previewCanvasRef.current;
    preview?.getContext("2d")?.clearRect(0, 0, preview.width, preview.height);
    setIsOpen(false);
    setStatus("idle");
  };

  const apply = async () => {
    const imageCanvas = imageCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas?.getContext("2d");
    const imageCtx = imageCanvas?.getContext("2d");
    if (!imageCanvas || !drawCanvas || !drawCtx || !imageCtx) return;

    setStatus("applying");
    setError(null);
    try {
      // Full resolution: the reference canvas has the same pixel size as the drawing.
      const full = imageCtx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);
      const result = await getClient().trace(full, params, 1);

      if (result.image && result.bounds) {
        // putImageData would REPLACE pixels (wiping existing marks), so go
        // through a small canvas and drawImage, which blends on top.
        const tmp = document.createElement("canvas");
        tmp.width = result.bounds.width;
        tmp.height = result.bounds.height;
        tmp.getContext("2d")?.putImageData(result.image, 0, 0);

        drawCtx.save();
        drawCtx.globalCompositeOperation = "source-over"; // eraser may have left destination-out
        drawCtx.drawImage(tmp, result.bounds.x, result.bounds.y);
        drawCtx.restore();
        onApplied(result.bounds);
      }
      cancel(); // close the panel and clear the preview
    } catch (err) {
      setError(String(err));
      setStatus("idle");
    }
  };

  return { isOpen, params, setParams, status, error, open, cancel, apply };
}
