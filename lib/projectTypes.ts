import type { AutoTraceParams } from "./autoTrace";
import type { Orientation } from "./printLayout";

/** Everything about the editor's state that a project remembers (besides pixels). */
export interface ProjectSettings {
  opacity: number;
  lineWidth: number;
  eraserWidth: number;
  smoothing: number;
  orientation: Orientation;
  zoom: number;
  /** PDF file name. */
  fileName: string;
  trace: AutoTraceParams;
}

/** Small, listable part of a project (no big images except the thumbnail). */
export interface ProjectMeta {
  id: string;
  name: string;
  /** Milliseconds since 1970 (Date.now()). */
  createdAt: number;
  updatedAt: number;
  thumbnail: Blob;
  settings: ProjectSettings;
}

/** A complete project. Undo history is intentionally not stored. */
export interface Project extends ProjectMeta {
  /** The photo exactly as uploaded (re-capped to 3300 px when opened). */
  photo: Blob;
  /** The drawing layer as a transparent PNG. */
  drawing: Blob;
}

/**
 * A string that changes whenever a setting that matters for "unsaved
 * changes" changes. Fields are listed explicitly so the order is fixed.
 * Zoom is left out on purpose: zooming around shouldn't count as an edit.
 */
export function settingsKey(s: ProjectSettings): string {
  return JSON.stringify([
    s.opacity,
    s.lineWidth,
    s.eraserWidth,
    s.smoothing,
    s.orientation,
    s.fileName,
    s.trace.detail,
    s.trace.smoothing,
    s.trace.minLineLength,
    s.trace.thickness,
  ]);
}

/**
 * Fill in anything missing from `incoming` (e.g. an older or hand-edited
 * project file) with the editor's current values, so opening never
 * produces undefined settings.
 */
export function mergeSettings(fallback: ProjectSettings, incoming: Partial<ProjectSettings>): ProjectSettings {
  return {
    ...fallback,
    ...incoming,
    trace: { ...fallback.trace, ...(incoming.trace ?? {}) },
  };
}
