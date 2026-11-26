"use client";

import { useRef, useState } from "react";
import { AutoTracePanel } from "./components/AutoTracePanel";
import { CanvasStack } from "./components/CanvasStack";
import { DrawingTools } from "./components/DrawingTools";
import { ExportControls } from "./components/ExportControls";
import { ProjectControls } from "./components/ProjectControls";
import { ProjectsDialog } from "./components/ProjectsDialog";
import { BUTTON_PLAIN } from "./components/ui";
import { ViewControls } from "./components/ViewControls";
import { useAutoTrace } from "./hooks/useAutoTrace";
import { useDrawingEngine, type DrawMode } from "./hooks/useDrawingEngine";
import { useProjects } from "./hooks/useProjects";
import { useUndoHistory } from "./hooks/useUndoHistory";
import { useZoom } from "./hooks/useZoom";
import { capToLongSide } from "@/lib/canvasSize";
import { exportDrawingPdf } from "@/lib/exportPdf";
import { loadImageFromBlob } from "@/lib/loadImage";
import { computeFitZoom, computePrintLayout, type Orientation, type Size } from "@/lib/printLayout";
import { PROJECT_FILE_EXTENSION } from "@/lib/projectFile";
import { mergeSettings, type ProjectSettings } from "@/lib/projectTypes";

/**
 * The page owns the shared UI state and wires the pieces together:
 * toolbar groups (presentational), the canvas stack (DOM), the drawing
 * engine (pointer input), undo history (pixel patches), Auto-Trace and
 * projects (save/open/import/export).
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

  /**
   * Put a photo on the reference canvas and size both canvases to it.
   * Clears the drawing; the caller resets undo history afterwards.
   */
  const loadPhoto = async (photo: Blob): Promise<boolean> => {
    const img = await loadImageFromBlob(photo);
    autoTrace.cancel(); // a preview of the old photo would be meaningless
    const imageCanvas = imageCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const container = containerRef.current;
    const ctx = imageCanvas?.getContext("2d");
    if (!imageCanvas || !drawCanvas || !container || !ctx) return false;

    // Both canvases share one pixel size: the photo's, scaled down if its
    // long side exceeds the cap (see lib/canvasSize.ts for why). Setting
    // width/height also clears a canvas, which wipes any previous drawing.
    const size = capToLongSide({ width: img.width, height: img.height });
    imageCanvas.width = size.width;
    imageCanvas.height = size.height;
    drawCanvas.width = size.width;
    drawCanvas.height = size.height;

    ctx.imageSmoothingQuality = "high"; // better downscaling of large photos
    ctx.drawImage(img, 0, 0, size.width, size.height);
    URL.revokeObjectURL(img.src); // pixels are on the canvas; free the decoded file

    setImageLoaded(true);
    setImgDimensions(size);
    zoom.setFitZoom(
      computeFitZoom(size, { width: container.clientWidth, height: container.clientHeight })
    );
    setOrientation(size.width > size.height ? "landscape" : "portrait");
    return true;
  };

  const settings: ProjectSettings = {
    opacity,
    lineWidth,
    eraserWidth,
    smoothing,
    orientation,
    zoom: zoom.zoom,
    fileName,
    trace: autoTrace.params,
  };

  const applySettings = (incoming: ProjectSettings) => {
    const s = mergeSettings(settings, incoming);
    setOpacity(s.opacity);
    setLineWidth(s.lineWidth);
    setEraserWidth(s.eraserWidth);
    setSmoothing(s.smoothing);
    setOrientation(s.orientation);
    setFileName(s.fileName);
    autoTrace.setParams(s.trace);
    zoom.zoomTo(s.zoom);
  };

  const projects = useProjects({
    imageCanvasRef,
    drawCanvasRef,
    imageLoaded,
    settings,
    applySettings,
    loadPhoto,
    history,
  });

  const handlePhotoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (file) await projects.startFromPhoto(file);
  };

  const handleProjectFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await projects.importFile(file);
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

      <div className="flex flex-wrap items-center justify-center gap-3">
        <input
          type="file"
          accept="image/*"
          onChange={handlePhotoChosen}
          className="border border-gray-300 rounded-md p-2 bg-white"
        />
        <button onClick={projects.openList} disabled={projects.busy} className={BUTTON_PLAIN}>
          Projects
        </button>
        {/* A <label> wrapping a hidden file input acts as a styled "choose file" button. */}
        <label className={`${BUTTON_PLAIN} cursor-pointer`}>
          Import project
          <input
            type="file"
            accept={`application/json,.json,${PROJECT_FILE_EXTENSION}`}
            onChange={handleProjectFileChosen}
            className="hidden"
          />
        </label>
      </div>

      {projects.message && (
        <div
          className={`flex w-full max-w-4xl items-start justify-between gap-4 rounded-md border p-3 text-sm ${
            projects.message.kind === "error"
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-green-300 bg-green-50 text-green-700"
          }`}
        >
          <span>{projects.message.text}</span>
          <button onClick={projects.dismissMessage} className="text-gray-500" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

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

          <hr className="border-gray-200" />

          <ProjectControls controls={projects} />
        </div>
      )}

      {!imageLoaded && (
        <p className="text-gray-500 text-sm">Upload an image, or open a saved project, to get started</p>
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

      <ProjectsDialog controls={projects} />
    </main>
  );
}
