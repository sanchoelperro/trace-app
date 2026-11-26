import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

export const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

/**
 * Keep a picture point (canvas pixels) under a screen point (client px).
 * Used by pinch-zoom/pan; zoom buttons don't pass one.
 */
export interface ZoomAnchor {
  canvasX: number;
  canvasY: number;
  clientX: number;
  clientY: number;
}

export interface ZoomControls {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  /** Set the fit zoom for a newly loaded image and switch to it. */
  setFitZoom: (fit: number) => void;
  /** Zoom (clamped to the allowed range), optionally keeping `anchor` in place. */
  zoomTo: (requested: number, anchor?: ZoomAnchor) => void;
}

/**
 * Zoom level of the canvas stack plus scroll adjustment for anchored zoom.
 *
 * 1 zoom unit = 1 CSS pixel per canvas pixel (both canvases are displayed
 * at canvasSize * zoom).
 *
 * WHY useLayoutEffect: a new zoom only becomes a new on-screen size after
 * React re-renders. The scroll position for an anchored zoom must be set
 * after that DOM update but BEFORE the browser paints; otherwise the picture
 * would visibly jump for one frame. useLayoutEffect runs exactly there.
 */
export function useZoom(containerRef: RefObject<HTMLDivElement | null>): ZoomControls {
  const [zoom, setZoom] = useState(1);
  // Refs mirror values needed by callbacks that the pointer engine holds on to.
  const zoomRef = useRef(1);
  const fitZoomRef = useRef(1);
  const pendingAnchor = useRef<ZoomAnchor | null>(null);

  /** Scroll the container so the anchor's picture point sits under its screen point. */
  const scrollToAnchor = useCallback(
    (anchor: ZoomAnchor, z: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      // The content's left edge on screen is rect.left + border - scrollLeft,
      // and the picture point is canvasX * z pixels into the content.
      // Solve for scrollLeft (the browser clamps it to the valid range).
      container.scrollLeft = rect.left + container.clientLeft + anchor.canvasX * z - anchor.clientX;
      container.scrollTop = rect.top + container.clientTop + anchor.canvasY * z - anchor.clientY;
    },
    [containerRef]
  );

  useLayoutEffect(() => {
    if (!pendingAnchor.current) return;
    scrollToAnchor(pendingAnchor.current, zoom);
    pendingAnchor.current = null;
  }, [zoom, scrollToAnchor]);

  const zoomTo = useCallback(
    (requested: number, anchor?: ZoomAnchor) => {
      // Allow zooming out far enough to see the whole image even if it is huge.
      const minZoom = Math.min(0.1, fitZoomRef.current);
      const z = Math.min(Math.max(requested, minZoom), MAX_ZOOM);

      if (z === zoomRef.current) {
        // No re-render will happen (same state), so scroll right away.
        // This is the pure two-finger pan case.
        if (anchor) scrollToAnchor(anchor, z);
        return;
      }
      zoomRef.current = z;
      pendingAnchor.current = anchor ?? null;
      setZoom(z);
    },
    [scrollToAnchor]
  );

  const zoomIn = useCallback(() => zoomTo(zoomRef.current + ZOOM_STEP), [zoomTo]);
  const zoomOut = useCallback(() => zoomTo(zoomRef.current - ZOOM_STEP), [zoomTo]);
  const zoomToFit = useCallback(() => zoomTo(fitZoomRef.current), [zoomTo]);

  const setFitZoom = useCallback(
    (fit: number) => {
      fitZoomRef.current = fit;
      zoomTo(fit);
    },
    [zoomTo]
  );

  return { zoom, zoomIn, zoomOut, zoomToFit, setFitZoom, zoomTo };
}
