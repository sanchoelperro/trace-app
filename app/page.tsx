"use client";

import { useRef, useState } from "react";
import jsPDF from "jspdf";

// US Letter paper size in millimeters (8.5in x 11in)
const LETTER = { width: 215.9, height: 279.4 };

export default function Home() {
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [opacity, setOpacity] = useState(0.4);
  const [lineWidth, setLineWidth] = useState(2);
  const [eraserWidth, setEraserWidth] = useState(10);
  const [mode, setMode] = useState<"pen" | "eraser">("pen");
  const [zoom, setZoom] = useState(1);
  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [fileName, setFileName] = useState("trace-drawing");
  const isDrawing = useRef(false);

  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const imageCanvas = imageCanvasRef.current;
      const drawCanvas = drawCanvasRef.current;
      if (!imageCanvas || !drawCanvas) return;

      imageCanvas.width = img.width;
      imageCanvas.height = img.height;
      drawCanvas.width = img.width;
      drawCanvas.height = img.height;

      const ctx = imageCanvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, img.width, img.height);
      setImageLoaded(true);
      setImgDimensions({ width: img.width, height: img.height });
      setZoom(1);

      setOrientation(img.width > img.height ? "landscape" : "portrait");

      undoStack.current = [];
      redoStack.current = [];
      setCanUndo(false);
      setCanRedo(false);
    };

    img.src = imageUrl;
  };

  // Shared coordinate extractor — works for both mouse and touch events.
  // clientX/clientY come directly from mouse events, but from
  // e.touches[0] (the first finger) on touch events.
  const getPosFromEvent = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number;
    let clientY: number;

    if ("touches" in e) {
      // Touch event (iPhone/iPad)
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      // Mouse event (desktop/laptop)
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const saveSnapshot = () => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.current.push(snapshot);
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    saveSnapshot();

    const { x, y } = getPosFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawing.current = true;
  };

  const continueDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing.current) return;

    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getPosFromEvent(e);

    if (mode === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = eraserWidth;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = "black";
    }

    ctx.lineCap = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  // Mouse handlers (desktop/laptop)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => startDrawing(e);
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => continueDrawing(e);
  const handleMouseUp = () => stopDrawing();

  // Touch handlers (iPhone/iPad) — each calls preventDefault() first so the
  // page doesn't scroll while you're tracing with your finger
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    startDrawing(e);
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    continueDrawing(e);
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stopDrawing();
  };

  const handleUndo = () => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || undoStack.current.length === 0) return;

    const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    redoStack.current.push(currentState);

    const previousState = undoStack.current.pop()!;
    ctx.putImageData(previousState, 0, 0);

    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  };

  const handleRedo = () => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || redoStack.current.length === 0) return;

    const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.current.push(currentState);

    const nextState = redoStack.current.pop()!;
    ctx.putImageData(nextState, 0, 0);

    setCanRedo(redoStack.current.length > 0);
    setCanUndo(true);
  };

  const handleClearDrawing = () => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    saveSnapshot();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleZoomReset = () => setZoom(1);

  const displayWidth = imgDimensions.width * zoom;
  const displayHeight = imgDimensions.height * zoom;

  const pageWidthMm = orientation === "portrait" ? LETTER.width : LETTER.height;
  const pageHeightMm = orientation === "portrait" ? LETTER.height : LETTER.width;

  let previewWidthMm = pageWidthMm;
  let previewHeightMm = pageHeightMm;
  if (imgDimensions.width > 0 && imgDimensions.height > 0) {
    const imageAspect = imgDimensions.width / imgDimensions.height;
    const pageAspect = pageWidthMm / pageHeightMm;

    if (imageAspect > pageAspect) {
      previewWidthMm = pageWidthMm;
      previewHeightMm = pageWidthMm / imageAspect;
    } else {
      previewHeightMm = pageHeightMm;
      previewWidthMm = pageHeightMm * imageAspect;
    }
  }

  const handleExportPdf = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    const imageData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: orientation,
      unit: "mm",
      format: "letter",
    });

    const marginX = (pageWidthMm - previewWidthMm) / 2;
    const marginY = (pageHeightMm - previewHeightMm) / 2;

    pdf.addImage(
      imageData,
      "PNG",
      marginX,
      marginY,
      previewWidthMm,
      previewHeightMm
    );

    const safeName = fileName.trim() || "trace-drawing";
    pdf.save(`${safeName}.pdf`);
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
          {/* Drawing Tools */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Drawing
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <label htmlFor="opacity" className="text-sm text-gray-700 whitespace-nowrap">
                  Reference opacity: {Math.round(opacity * 100)}%
                </label>
                <input
                  id="opacity"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="w-40"
                />
              </div>

              <div className="flex items-center gap-3">
                <label htmlFor="lineWidth" className="text-sm text-gray-700 whitespace-nowrap">
                  Pen thickness: {lineWidth}px
                </label>
                <input
                  id="lineWidth"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={lineWidth}
                  onChange={(e) => setLineWidth(parseInt(e.target.value))}
                  className="w-40"
                />
              </div>

              <div className="flex items-center gap-3">
                <label htmlFor="eraserWidth" className="text-sm text-gray-700 whitespace-nowrap">
                  Eraser size: {eraserWidth}px
                </label>
                <input
                  id="eraserWidth"
                  type="range"
                  min="5"
                  max="40"
                  step="5"
                  value={eraserWidth}
                  onChange={(e) => setEraserWidth(parseInt(e.target.value))}
                  className="w-40"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMode("pen")}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    mode === "pen"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Pen
                </button>
                <button
                  onClick={() => setMode("eraser")}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    mode === "eraser"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Eraser
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="px-3 py-1.5 rounded-md text-sm border bg-white text-gray-700 border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Undo
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="px-3 py-1.5 rounded-md text-sm border bg-white text-gray-700 border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Redo
                </button>
                <button
                  onClick={handleClearDrawing}
                  disabled={!canUndo}
                  className="px-3 py-1.5 rounded-md text-sm border bg-white text-red-600 border-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear Drawing
                </button>
              </div>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* View controls */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              View
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleZoomOut}
                  className="px-3 py-1.5 rounded-md text-sm border bg-white text-gray-700 border-gray-300"
                >
                  Zoom Out
                </button>
                <span className="text-sm text-gray-700 w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="px-3 py-1.5 rounded-md text-sm border bg-white text-gray-700 border-gray-300"
                >
                  Zoom In
                </button>
                <button
                  onClick={handleZoomReset}
                  className="px-3 py-1.5 rounded-md text-sm border bg-white text-gray-700 border-gray-300"
                >
                  Reset
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOrientation("portrait")}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    orientation === "portrait"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Portrait
                </button>
                <button
                  onClick={() => setOrientation("landscape")}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    orientation === "landscape"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Landscape
                </button>
              </div>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Export */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Export
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="fileName" className="text-sm text-gray-700 whitespace-nowrap">
                  File name:
                </label>
                <input
                  id="fileName"
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-48"
                  placeholder="trace-drawing"
                />
                <span className="text-sm text-gray-400">.pdf</span>
              </div>

              <button
                onClick={handleExportPdf}
                disabled={!canUndo}
                className="px-4 py-1.5 rounded-md text-sm border bg-green-600 text-white border-green-600 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:border-gray-400"
              >
                Export PDF
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Your tracing will print at {previewWidthMm.toFixed(0)}mm ×{" "}
              {previewHeightMm.toFixed(0)}mm on 8.5x11in (Letter) {orientation} paper
              {(previewWidthMm < pageWidthMm - 1 || previewHeightMm < pageHeightMm - 1) &&
                " (centered, with a small margin to preserve proportions)"}
              .
            </p>
          </div>
        </div>
      )}

      {!imageLoaded && (
        <p className="text-gray-500 text-sm">
          Upload an image to get started
        </p>
      )}

      <div
        className="border border-gray-300 bg-gray-100 shadow-sm"
        style={{
          width: "100%",
          maxWidth: "900px",
          height: "70vh",
          overflow: "auto",
        }}
      >
        <div
          className="relative"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <canvas
            ref={imageCanvasRef}
            style={{
              opacity,
              width: displayWidth,
              height: displayHeight,
            }}
            className="block"
          />
          <canvas
            ref={drawCanvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              width: displayWidth,
              height: displayHeight,
              touchAction: "none",
            }}
            className={`absolute top-0 left-0 ${
              mode === "eraser" ? "cursor-cell" : "cursor-crosshair"
            }`}
          />
        </div>
      </div>
    </main>
  );
}
