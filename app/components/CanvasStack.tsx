import type { RefObject } from "react";
import type { DrawMode } from "../hooks/useDrawingEngine";

export interface CanvasStackProps {
  containerRef: RefObject<HTMLDivElement | null>;
  imageCanvasRef: RefObject<HTMLCanvasElement | null>;
  drawCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** On-screen size in CSS pixels (image pixel size x zoom). */
  displayWidth: number;
  displayHeight: number;
  opacity: number;
  mode: DrawMode;
}

/**
 * Scrollable viewport holding two canvases stacked exactly on top of each other:
 *  1. the reference photo (faded by `opacity`)
 *  2. the transparent drawing layer (receives pointer input, exported to PDF)
 *
 * Both canvases keep the photo's full pixel size internally; zoom only
 * changes their CSS width/height, so drawing coordinates stay stable.
 */
export function CanvasStack({
  containerRef,
  imageCanvasRef,
  drawCanvasRef,
  displayWidth,
  displayHeight,
  opacity,
  mode,
}: CanvasStackProps) {
  return (
    <div
      ref={containerRef}
      className="border border-gray-300 bg-gray-100 shadow-sm"
      style={{
        width: "100%",
        maxWidth: "900px",
        height: "70vh",
        overflow: "auto",
      }}
    >
      <div className="relative" style={{ width: displayWidth, height: displayHeight }}>
        <canvas
          ref={imageCanvasRef}
          style={{ opacity, width: displayWidth, height: displayHeight }}
          className="block"
        />
        <canvas
          ref={drawCanvasRef}
          style={{
            width: displayWidth,
            height: displayHeight,
            // Tell the browser not to scroll/zoom on touches over the drawing layer.
            touchAction: "none",
          }}
          className={`absolute top-0 left-0 ${
            mode === "eraser" ? "cursor-cell" : "cursor-crosshair"
          }`}
        />
      </div>
    </div>
  );
}
