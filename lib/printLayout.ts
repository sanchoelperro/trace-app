// Print layout math for placing the drawing on US Letter paper.
// Pure functions only: no DOM, no React, easy to reason about and test.

export type Orientation = "portrait" | "landscape";

export interface Size {
  width: number;
  height: number;
}

/** US Letter paper size in millimeters (8.5in x 11in). */
export const LETTER: Size = { width: 215.9, height: 279.4 };

export interface PrintLayout {
  /** Page size in mm for the chosen orientation. */
  pageWidthMm: number;
  pageHeightMm: number;
  /** Size of the drawing on the page in mm (fits the page, keeps aspect ratio). */
  widthMm: number;
  heightMm: number;
  /** Offsets in mm that center the drawing on the page. */
  marginXMm: number;
  marginYMm: number;
  /** True when the drawing does not fill the page in one direction. */
  hasMargin: boolean;
}

/**
 * Fit an image of the given pixel size onto a Letter page ("contain" fit),
 * centered. If the image has no size yet, the drawing fills the page.
 */
export function computePrintLayout(image: Size, orientation: Orientation): PrintLayout {
  const pageWidthMm = orientation === "portrait" ? LETTER.width : LETTER.height;
  const pageHeightMm = orientation === "portrait" ? LETTER.height : LETTER.width;

  let widthMm = pageWidthMm;
  let heightMm = pageHeightMm;

  if (image.width > 0 && image.height > 0) {
    const imageAspect = image.width / image.height;
    const pageAspect = pageWidthMm / pageHeightMm;

    // Wider than the page (relative to height): width is the limiting side.
    if (imageAspect > pageAspect) {
      widthMm = pageWidthMm;
      heightMm = pageWidthMm / imageAspect;
    } else {
      heightMm = pageHeightMm;
      widthMm = pageHeightMm * imageAspect;
    }
  }

  return {
    pageWidthMm,
    pageHeightMm,
    widthMm,
    heightMm,
    marginXMm: (pageWidthMm - widthMm) / 2,
    marginYMm: (pageHeightMm - heightMm) / 2,
    // 1mm tolerance so floating-point rounding doesn't show a "margin" note.
    hasMargin: widthMm < pageWidthMm - 1 || heightMm < pageHeightMm - 1,
  };
}

/**
 * Zoom level that fits the whole image inside the container,
 * never enlarging beyond 100%.
 */
export function computeFitZoom(image: Size, container: Size): number {
  const widthRatio = container.width / image.width;
  const heightRatio = container.height / image.height;
  return Math.min(widthRatio, heightRatio, 1);
}
