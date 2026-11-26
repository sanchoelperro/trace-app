// Canvas <-> Blob helpers used when saving and opening projects.

import { capToLongSide } from "./canvasSize";

const THUMBNAIL_LONG_SIDE = 320;

/** Promise wrapper for canvas.toBlob (which uses a callback). */
export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the canvas image"))),
      type,
      quality
    );
  });
}

/**
 * Small JPEG preview for the project list: the faded photo with the
 * drawing on top, like the editor shows it.
 */
export function makeThumbnail(
  photo: HTMLCanvasElement,
  drawing: HTMLCanvasElement,
  photoOpacity: number
): Promise<Blob> {
  const size = capToLongSide({ width: photo.width, height: photo.height }, THUMBNAIL_LONG_SIDE);
  const thumb = document.createElement("canvas");
  thumb.width = size.width;
  thumb.height = size.height;
  const ctx = thumb.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas not available"));

  // JPEG has no transparency, so start from white paper.
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.globalAlpha = photoOpacity;
  ctx.drawImage(photo, 0, 0, size.width, size.height);
  ctx.globalAlpha = 1;
  ctx.drawImage(drawing, 0, 0, size.width, size.height);
  return canvasToBlob(thumb, "image/jpeg", 0.8);
}

/**
 * True if any pixel of the canvas is not fully transparent.
 * Used after opening a project to know whether Export/Clear make sense.
 */
export function canvasHasMarks(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return true; // every 4th byte is alpha
  }
  return false;
}
