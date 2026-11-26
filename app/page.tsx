"use client";

import { useRef, useState } from "react";
import { AutoTracePanel } from "./components/AutoTracePanel";
import { CanvasStack } from "./components/CanvasStack";
import { DrawingTools } from "./components/DrawingTools";
import { ExportControls } from "./components/ExportControls";
import { ViewControls } from "./components/ViewControls";
import { useAutoTrace } from "./hooks/useAutoTrace";
import { useDrawingEngine, type DrawMode } from "./hooks/useDrawingEngine";
import { useUndoHistory } from "./hooks/useUndoHistory";
import { useZoom } from "./hooks/useZoom";
import { capToLongSide } from "@/lib/canvasSize";
import { exportDrawingPdf } from "@/lib/exportPdf";
import { loadImageFromFile } from "@/lib/loadImage";
import { computeFitZoom, computePrintLayout, type Orientation, type Size } from "@/lib/printLayout";

/**
 * The page owns the shared UI state and wires the pieces together:
 * toolbar groups (presentational), the canvas stack (DOM), the drawing
 * engine (pointer input) and undo history (pixel snapshots).
 */
export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [opacity, setOpacity] = useState(0.4);
  const [lineWidth, setLineWidth] = useState(2);
  const [eraserWidth, setEraserWidth] = useState(10);
  const [smoothing, setSmoothing] = useState(0);
  const [mode, setMode] = useState<DrawMode>("pen");
  const [imgDimensions, setImgDimensions] = useState<Size>({ width: 0, height: 0 });
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [fileName, setFileName] = useState("trace-drawing");

  const history = useUndoHistory(drawCanvasRef);
  const zoom = useZoom(containerRef);
  const autoTrace = useAutoTrace({
    imageCanvasRef,
    drawCanvasRef,
    previewCanvasRef,
    onApplied: history.recordChange,
  });
  useDrawingEngine(
    drawCanvasRef,
    { mode, lineWidth, eraserWidth, smoothing },
    {
      onStrokeCommit: history.recordChange,
      onStrokeCancel: history.discardUncommitted,
      onGestureZoom: zoom.zoomTo,
    }
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = await loadImageFromFile(file);
    autoTrace.cancel(); // a preview of the old photo would be meaningless
    const imageCanvas = imageCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const container = containerRef.current;
    if (!imageCanvas || !drawCanvas || !container) return;

    // Both canvases share one pixel size: the photo's, scaled down if its
    // long side exceeds the cap (see lib/canvasSize.ts for why). Setting
    // width/height also clears a canvas, which wipes any previous drawing.
    const size = capToLongSide({ width: img.width, height: img.height });
    imageCanvas.width = size.width;
    imageCanvas.height = size.height;
    drawCanvas.width = size.width;
    drawCanvas.height = size.height;

    const ctx = imageCanvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high"; // better downscaling of large photos
    ctx.drawImage(img, 0, 0, size.width, size.height);
    URL.revokeObjectURL(img.src); // pixels are on the canvas; free the decoded file

    setImageLoaded(true);
    setImgDimensions(size);

    const fit = computeFitZoom(size, {
      width: container.clientWidth,
      height: container.clientHeight,
    });
    zoom.setFitZoom(fit);

    setOrientation(size.width > size.height ? "landscape" : "portrait");
    history.reset();
  };

  const layout = computePrintLayout(imgDimensions, orientation);

  const handleExportPdf = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    exportDrawingPdf(canvas, layout, orientation, fileName);
  };

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8 bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-800">Trace &amp; Paint</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a reference photo, trace it, and export a print-ready PDF.
        </p>
      </div>

      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="border border-gray-300 rounded-md p-2 bg-white"
      />

      {imageLoaded && (
        <div className="flex flex-col gap-4 bg-white border border-gray-300 rounded-md p-4 w-full max-w-4xl">
          <DrawingTools
            opacity={opacity}
            onOpacityChange={setOpacity}
            lineWidth={lineWidth}
            onLineWidthChange={setLineWidth}
            eraserWidth={eraserWidth}
            onEraserWidthChange={setEraserWidth}
            smoothing={smoothing}
            onSmoothingChange={setSmoothing}
            mode={mode}
            onModeChange={setMode}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            canClear={history.hasMarks}
            onUndo={history.undo}
            onRedo={history.redo}
            onClear={history.clearWithUndo}
          />

          <hr className="border-gray-200" />

          <AutoTracePanel controls={autoTrace} />

          <hr className="border-gray-200" />

          <ViewControls
            zoom={zoom.zoom}
            onZoomIn={zoom.zoomIn}
            onZoomOut={zoom.zoomOut}
            onFit={zoom.zoomToFit}
            orientation={orientation}
            onOrientationChange={setOrientation}
          />

          <hr className="border-gray-200" />

          <ExportControls
            fileName={fileName}
            onFileNameChange={setFileName}
            canExport={history.hasMarks}
            onExport={handleExportPdf}
            layout={layout}
            orientation={orientation}
          />
        </div>
      )}

      {!imageLoaded && (
        <p className="text-gray-500 text-sm">Upload an image to get started</p>
      )}

      <CanvasStack
        containerRef={containerRef}
        imageCanvasRef={imageCanvasRef}
        drawCanvasRef={drawCanvasRef}
        previewCanvasRef={previewCanvasRef}
        showPreview={autoTrace.isOpen}
        displayWidth={imgDimensions.width * zoom.zoom}
        displayHeight={imgDimensions.height * zoom.zoom}
        opacity={opacity}
        mode={mode}
      />
    </main>
  );
}
