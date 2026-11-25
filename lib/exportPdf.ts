import jsPDF from "jspdf";
import type { Orientation, PrintLayout } from "./printLayout";

/**
 * Save the drawing canvas (lines only, transparent background) as a
 * Letter-size PDF. The reference photo lives on a different canvas,
 * so it is never included.
 */
export function exportDrawingPdf(
  drawCanvas: HTMLCanvasElement,
  layout: PrintLayout,
  orientation: Orientation,
  fileName: string
): void {
  const imageData = drawCanvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "letter",
  });

  pdf.addImage(
    imageData,
    "PNG",
    layout.marginXMm,
    layout.marginYMm,
    layout.widthMm,
    layout.heightMm
  );

  const safeName = fileName.trim() || "trace-drawing";
  pdf.save(`${safeName}.pdf`);
}
