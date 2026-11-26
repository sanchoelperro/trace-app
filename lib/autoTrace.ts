// Auto-Trace: turn a photo into a line drawing with Canny edge detection.
//
// Pure TypeScript on typed arrays (no DOM), so it can run inside a Web
// Worker. Pipeline:
//   1. grayscale            - edges are changes in brightness
//   2. Gaussian blur        - suppress noise/texture before measuring change
//   3. Sobel gradients      - how strongly and in which direction brightness changes
//   4. non-maximum suppression - thin wide edges down to 1-pixel ridges
//   5. hysteresis           - keep strong edges + weak edges connected to them
//   6. speck removal        - drop tiny isolated bits of line
//   7. thickness            - widen the 1-pixel lines, output black on transparent
//
// SCALE INDEPENDENCE: the sliders mean the same thing at any resolution.
// Sizes (blur, speck length) are defined for an image whose long side is
// REFERENCE_LONG_SIDE px and multiplied by k = longSide / REFERENCE_LONG_SIDE.
// Gradient strength is multiplied by k too: blurring over more pixels makes
// the per-pixel change smaller, and this undoes that. Result: Apply at full
// resolution closely matches the ~1000 px preview.

import type { Rect } from "./geometry";

export const REFERENCE_LONG_SIDE = 1000;

export interface AutoTraceParams {
  /** 1..100. Higher = lower thresholds = more (fainter) edges. */
  detail: number;
  /** Blur strength (sigma, reference px). Higher = ignore fine texture. */
  smoothing: number;
  /** Minimum connected line length (reference px) to keep. 0 = keep all. */
  minLineLength: number;
  /** Final line width in DRAWING-canvas pixels (same unit as the pen). */
  thickness: number;
}

export const DEFAULT_TRACE_PARAMS: AutoTraceParams = {
  detail: 50,
  smoothing: 1.5,
  minLineLength: 15,
  thickness: 2,
};

/** Ratio of Canny's high threshold to its low threshold. */
const HIGH_TO_LOW_RATIO = 2.5;

export interface TraceInput {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  params: AutoTraceParams;
  /**
   * Drawing-canvas pixels per processing pixel (1 for Apply, ~3 for the
   * downscaled preview). Converts `thickness` into processing pixels.
   */
  outputScale: number;
}

export interface TraceOutput {
  /** Black-on-transparent RGBA, cropped to `bounds` (empty if no lines). */
  rgba: Uint8ClampedArray;
  /** Where the cropped image goes, or null when nothing was found. */
  bounds: Rect | null;
}

/** Run the full pipeline. */
export function traceEdges(input: TraceInput): TraceOutput {
  const { width: w, height: h, params } = input;
  const k = Math.max(w, h) / REFERENCE_LONG_SIDE;

  // Two float buffers are reused through the whole pipeline to keep memory
  // down (at 3300x2550 each is ~34 MB; iPads have tight limits).
  const gray = toGrayscale(input.rgba, w, h);
  const scratch = new Float32Array(w * h);

  gaussianBlur(gray, scratch, w, h, params.smoothing * k);

  const magnitude = scratch; // blur is done with scratch; reuse it
  const direction = new Uint8Array(w * h);
  sobel(gray, magnitude, direction, w, h, k);

  const { low, high } = thresholdsForDetail(params.detail);
  const edges = nonMaxSuppression(magnitude, direction, w, h, low, high);
  hysteresis(edges, w, h);
  removeSpecks(edges, w, h, Math.round(params.minLineLength * k));

  const radius = params.thickness / input.outputScale / 2;
  return renderLines(edges, w, h, radius);
}

/**
 * Map the Detail slider to Canny thresholds (in Sobel magnitude units on a
 * 0-255 gray scale; a hard black/white step measures about 1000).
 * Squared curve: most of the slider's travel is spent in the useful
 * low-threshold range where photos change the most.
 */
export function thresholdsForDetail(detail: number): { low: number; high: number } {
  const t = (100 - Math.min(Math.max(detail, 1), 100)) / 100;
  const low = 10 + 140 * t * t;
  return { low, high: low * HIGH_TO_LOW_RATIO };
}

// ---- 1. grayscale --------------------------------------------------------

/** Perceptual brightness (ITU-R BT.601 weights: eyes are most sensitive to green). */
function toGrayscale(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return gray;
}

// ---- 2. Gaussian blur ----------------------------------------------------

/** Normalized 1-D Gaussian weights covering +-3 sigma (99.7% of the curve). */
function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  return kernel;
}

/**
 * Blur `data` in place. A 2-D Gaussian equals a horizontal 1-D blur followed
 * by a vertical one ("separable"), which costs 2r instead of r*r per pixel.
 * Pixels beyond the border repeat the edge pixel.
 */
function gaussianBlur(data: Float32Array, tmp: Float32Array, w: number, h: number, sigma: number): void {
  if (sigma < 0.3) return; // too small to matter
  const kernel = gaussianKernel(sigma);
  const r = (kernel.length - 1) / 2;

  // Horizontal: data -> tmp
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        acc += data[row + xx] * kernel[i + r];
      }
      tmp[row + x] = acc;
    }
  }

  // Vertical: tmp -> data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        acc += tmp[yy * w + x] * kernel[i + r];
      }
      data[y * w + x] = acc;
    }
  }
}

// ---- 3. Sobel gradients ----------------------------------------------------

/** tan(22.5 deg): boundary between "horizontal" and "diagonal" directions. */
const TAN_22_5 = 0.41421356;

/**
 * Edge strength and direction per pixel using the 3x3 Sobel operator.
 *
 * Direction is rounded to one of 4 bins, telling NMS which two neighbours
 * lie ACROSS the edge (along the gradient):
 *   0: left/right   1: down-right/up-left   2: up/down   3: up-right/down-left
 * Border pixels get magnitude 0.
 */
function sobel(
  src: Float32Array,
  magnitude: Float32Array,
  direction: Uint8Array,
  w: number,
  h: number,
  gain: number
): void {
  magnitude.fill(0);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = src[i - w - 1], t = src[i - w], tr = src[i - w + 1];
      const l = src[i - 1], r = src[i + 1];
      const bl = src[i + w - 1], b = src[i + w], br = src[i + w + 1];

      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
      magnitude[i] = Math.hypot(gx, gy) * gain;

      // Quantize the angle with ratio tests (cheaper than atan2).
      const ax = Math.abs(gx);
      const ay = Math.abs(gy);
      if (ay <= ax * TAN_22_5) direction[i] = 0;
      else if (ax <= ay * TAN_22_5) direction[i] = 2;
      else direction[i] = gx * gy > 0 ? 1 : 3; // y grows downward on screen
    }
  }
}

// ---- 4. non-maximum suppression + double threshold ---------------------------

// 0 = not an edge (the array default)
const WEAK = 1;
const STRONG = 2;

/**
 * Keep a pixel only if it is the peak of edge strength across the edge,
 * which thins blurry multi-pixel edges to 1-pixel lines. Survivors are
 * classified STRONG (>= high), WEAK (>= low) or left at 0.
 */
function nonMaxSuppression(
  mag: Float32Array,
  dir: Uint8Array,
  w: number,
  h: number,
  low: number,
  high: number
): Uint8Array {
  const out = new Uint8Array(w * h);
  // Neighbour offsets across the edge for each direction bin.
  const offsets = [1, w + 1, w, w - 1];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < low) continue;

      const o = offsets[dir[i]];
      // ">" on one side, ">=" on the other: on a flat plateau exactly one
      // pixel wins instead of both (which would make 2-pixel lines).
      if (m > mag[i - o] && m >= mag[i + o]) {
        out[i] = m >= high ? STRONG : WEAK;
      }
    }
  }
  return out;
}

// ---- 5. hysteresis -----------------------------------------------------------

/** The 8 neighbours of a pixel as index offsets (for row width w). */
function neighbourOffsets(w: number): number[] {
  return [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
}

/**
 * Keep weak pixels only if they connect (8-way) to a strong pixel.
 * Strong edges are confident; weak ones are kept only as continuations,
 * which closes gaps without adding noise. Result: 1 = edge, 0 = none.
 */
function hysteresis(edges: Uint8Array, w: number, h: number): void {
  const KEPT = 3;
  const nbs = neighbourOffsets(w);
  const stack: number[] = [];

  for (let i = 0; i < edges.length; i++) {
    if (edges[i] === STRONG) {
      edges[i] = KEPT;
      stack.push(i);
    }
  }

  // Flood outward from every strong pixel through weak ones.
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % w;
    if (x === 0 || x === w - 1 || i < w || i >= w * (h - 1)) continue; // skip borders
    for (const o of nbs) {
      if (edges[i + o] === WEAK) {
        edges[i + o] = KEPT;
        stack.push(i + o);
      }
    }
  }

  for (let i = 0; i < edges.length; i++) edges[i] = edges[i] === KEPT ? 1 : 0;
}

// ---- 6. speck removal ----------------------------------------------------------

/**
 * Remove connected line pieces with fewer than `minPixels` pixels. Lines are
 * 1 pixel wide here, so pixel count is roughly the line's length.
 */
function removeSpecks(edges: Uint8Array, w: number, h: number, minPixels: number): void {
  if (minPixels <= 1) return;
  const VISITED = 2;
  const nbs = neighbourOffsets(w);
  const stack: number[] = [];
  const component: number[] = [];

  for (let start = 0; start < edges.length; start++) {
    if (edges[start] !== 1) continue;

    // Collect every pixel connected to `start`.
    component.length = 0;
    edges[start] = VISITED;
    stack.push(start);
    while (stack.length > 0) {
      const i = stack.pop()!;
      component.push(i);
      const x = i % w;
      if (x === 0 || x === w - 1 || i < w || i >= w * (h - 1)) continue;
      for (const o of nbs) {
        if (edges[i + o] === 1) {
          edges[i + o] = VISITED;
          stack.push(i + o);
        }
      }
    }

    if (component.length < minPixels) {
      for (const i of component) edges[i] = 0;
    }
  }

  for (let i = 0; i < edges.length; i++) if (edges[i] === VISITED) edges[i] = 1;
}

// ---- 7. thickness + output ------------------------------------------------------

/**
 * Stamp a filled disk of `radius` at every edge pixel ("dilation"),
 * producing black, fully opaque lines on transparent, cropped to the area
 * that has lines. A radius below 1 just keeps the 1-pixel line.
 */
function renderLines(edges: Uint8Array, w: number, h: number, radius: number): TraceOutput {
  const R = Math.floor(radius);
  const disk: [number, number][] = [];
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy <= radius * radius || (dx === 0 && dy === 0)) disk.push([dx, dy]);
    }
  }

  // Bounding box of edge pixels, grown by the stamp radius.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (edges[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { rgba: new Uint8ClampedArray(0), bounds: null };

  minX = Math.max(0, minX - R);
  minY = Math.max(0, minY - R);
  maxX = Math.min(w - 1, maxX + R);
  maxY = Math.min(h - 1, maxY + R);
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  // RGB stay 0 (black); only alpha is set.
  const rgba = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!edges[y * w + x]) continue;
      for (const [dx, dy] of disk) {
        const px = x + dx - minX;
        const py = y + dy - minY;
        if (px >= 0 && py >= 0 && px < bw && py < bh) rgba[(py * bw + px) * 4 + 3] = 255;
      }
    }
  }

  return { rgba, bounds: { x: minX, y: minY, width: bw, height: bh } };
}
