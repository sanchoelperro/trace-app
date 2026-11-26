// Export/Import of a project as ONE self-contained file.
//
// Format: plain JSON with the images embedded as data URLs (base64 text).
// No zip library needed; the file is ~33% bigger than the raw images,
// which is fine. Use it for backups and to move work between devices.

import type { Project, ProjectSettings } from "./projectTypes";

const FORMAT = "trace-paint-project";
const VERSION = 1;
export const PROJECT_FILE_EXTENSION = ".trace.json";

interface ProjectFileV1 {
  format: typeof FORMAT;
  version: typeof VERSION;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  photo: string; // data URL
  drawing: string; // data URL (PNG)
  thumbnail: string; // data URL (JPEG)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** fetch() understands data: URLs and gives us a Blob back with the right type. */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (!dataUrl.startsWith("data:image/")) throw new Error("Project file contains an invalid image");
  return (await fetch(dataUrl)).blob();
}

export async function projectToFile(project: Project): Promise<Blob> {
  const file: ProjectFileV1 = {
    format: FORMAT,
    version: VERSION,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    settings: project.settings,
    photo: await blobToDataUrl(project.photo),
    drawing: await blobToDataUrl(project.drawing),
    thumbnail: await blobToDataUrl(project.thumbnail),
  };
  return new Blob([JSON.stringify(file)], { type: "application/json" });
}

/**
 * Read a project file. The result gets a NEW id, so importing never
 * overwrites an existing project (e.g. one you kept editing on this device).
 */
export async function projectFromFile(file: File): Promise<Project> {
  let parsed: Partial<ProjectFileV1>;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("This file is not a Trace & Paint project.");
  }
  if (parsed.format !== FORMAT || typeof parsed.photo !== "string" || typeof parsed.drawing !== "string") {
    throw new Error("This file is not a Trace & Paint project.");
  }
  if (parsed.version !== VERSION) {
    throw new Error(`Unsupported project file version ${parsed.version}.`);
  }

  return {
    id: crypto.randomUUID(),
    name: parsed.name || file.name.replace(PROJECT_FILE_EXTENSION, ""),
    createdAt: parsed.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    settings: parsed.settings as ProjectSettings,
    photo: await dataUrlToBlob(parsed.photo),
    drawing: await dataUrlToBlob(parsed.drawing),
    thumbnail: await dataUrlToBlob(parsed.thumbnail ?? parsed.photo),
  };
}

/**
 * Let the browser save a file. Works on desktop and on iOS Safari 13+
 * (iOS asks "Download?" and puts it in Files > Downloads).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before freeing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
