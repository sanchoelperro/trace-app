import { useEffect, useRef, useState, type RefObject } from "react";
import { canvasHasMarks, canvasToBlob, makeThumbnail } from "@/lib/canvasBlobs";
import { loadImageFromBlob } from "@/lib/loadImage";
import { downloadBlob, PROJECT_FILE_EXTENSION, projectFromFile, projectToFile } from "@/lib/projectFile";
import {
  deleteProject as dbDelete,
  listProjects,
  loadProject,
  renameProject as dbRename,
  requestPersistentStorage,
  saveProject,
} from "@/lib/projectStore";
import { settingsKey, type Project, type ProjectMeta, type ProjectSettings } from "@/lib/projectTypes";
import type { UndoHistory } from "./useUndoHistory";

/** Autosave waits until you've paused this long (encoding a big PNG takes a moment). */
const AUTOSAVE_DELAY_MS = 5000;

/** What the projects feature needs from the editor (page). */
export interface ProjectHost {
  imageCanvasRef: RefObject<HTMLCanvasElement | null>;
  drawCanvasRef: RefObject<HTMLCanvasElement | null>;
  imageLoaded: boolean;
  /** The editor's current settings. */
  settings: ProjectSettings;
  applySettings: (settings: ProjectSettings) => void;
  /**
   * Put a photo on the reference canvas and size both canvases (clears the
   * drawing). Does NOT reset undo history; the caller does that.
   */
  loadPhoto: (photo: Blob) => Promise<boolean>;
  history: UndoHistory;
}

/** Which saved project the editor is showing (null = never saved). */
interface CurrentProject {
  id: string;
  name: string;
  createdAt: number;
}

/** Drawing revision + settings at the moment of the last save/open. */
interface SavedMarker {
  revision: number;
  key: string;
}

export interface ProjectListItem {
  meta: ProjectMeta;
  /** Object URL for the thumbnail <img>; revoked when the list closes. */
  thumbnailUrl: string;
}

export interface ProjectMessage {
  kind: "error" | "info";
  text: string;
}

export interface ProjectControls {
  currentName: string | null;
  isDirty: boolean;
  busy: boolean;
  message: ProjectMessage | null;
  dismissMessage: () => void;
  autosave: boolean;
  setAutosave: (on: boolean) => void;
  /** Projects view: null while closed. */
  list: ProjectListItem[] | null;
  openList: () => Promise<void>;
  closeList: () => void;
  startFromPhoto: (file: File) => Promise<void>;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  open: (id: string) => Promise<void>;
  rename: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  exportFile: () => Promise<void>;
  importFile: (file: File) => Promise<void>;
}

const DISCARD_PROMPT = "You have unsaved changes. Discard them?";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Save / open / import / export projects and track unsaved changes.
 *
 * "Unsaved" = the drawing revision or the settings differ from the moment of
 * the last save (or open). A never-saved photo counts as unsaved only once
 * something has been drawn on it.
 */
export function useProjects(host: ProjectHost): ProjectControls {
  const { history } = host;
  const [current, setCurrent] = useState<CurrentProject | null>(null);
  const [saved, setSaved] = useState<SavedMarker | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ProjectMessage | null>(null);
  const [list, setList] = useState<ProjectListItem[] | null>(null);
  const [autosave, setAutosave] = useState(false);
  /** The photo as uploaded/opened; saved with the project. */
  const photoRef = useRef<Blob | null>(null);

  const key = settingsKey(host.settings);
  const isDirty =
    host.imageLoaded &&
    (saved ? saved.revision !== history.revision || saved.key !== key : history.hasMarks);

  // Warn before closing/reloading the tab with unsaved work. Browsers show
  // their own generic text; preventDefault() is what triggers the dialog.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  /** Gather the editor's current state into a Project object. */
  const snapshot = async (id: string, name: string, createdAt: number): Promise<Project> => {
    const photoCanvas = host.imageCanvasRef.current;
    const drawCanvas = host.drawCanvasRef.current;
    if (!photoCanvas || !drawCanvas || !photoRef.current) throw new Error("No photo loaded");
    return {
      id,
      name,
      createdAt,
      updatedAt: Date.now(),
      settings: host.settings,
      photo: photoRef.current,
      drawing: await canvasToBlob(drawCanvas, "image/png"),
      thumbnail: await makeThumbnail(photoCanvas, drawCanvas, host.settings.opacity),
    };
  };

  /** Run an async action with the busy flag and error reporting. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const writeProject = async (target: CurrentProject, announce: boolean) => {
    // Note the revision BEFORE the slow encoding: anything drawn meanwhile
    // makes the project dirty again, which is correct.
    const marker: SavedMarker = { revision: history.getRevision(), key };
    const project = await snapshot(target.id, target.name, target.createdAt);
    await saveProject(project);
    setCurrent(target);
    setSaved(marker);
    if (announce) setMessage({ kind: "info", text: `Saved "${target.name}".` });
    void requestPersistentStorage();
  };

  const saveAs = () =>
    run(async () => {
      const name = window.prompt("Project name:", current?.name ?? host.settings.fileName)?.trim();
      if (!name) return;
      await writeProject({ id: crypto.randomUUID(), name, createdAt: Date.now() }, true);
    });

  const save = () => (current ? run(() => writeProject(current, true)) : saveAs());

  /** Show a project in the editor. `isStored` = it is saved in IndexedDB. */
  const showProject = async (project: Project, isStored: boolean) => {
    if (!(await host.loadPhoto(project.photo))) throw new Error("Could not open the project photo");
    photoRef.current = project.photo;

    // Paint the saved drawing, scaled if it came from a different canvas size.
    const drawCanvas = host.drawCanvasRef.current;
    const ctx = drawCanvas?.getContext("2d");
    if (!drawCanvas || !ctx) throw new Error("Canvas not available");
    const img = await loadImageFromBlob(project.drawing);
    ctx.drawImage(img, 0, 0, drawCanvas.width, drawCanvas.height);
    URL.revokeObjectURL(img.src);

    // Reset AFTER painting: the undo backup must start from the opened drawing.
    history.reset(canvasHasMarks(drawCanvas));
    host.applySettings(project.settings);

    setCurrent(isStored ? { id: project.id, name: project.name, createdAt: project.createdAt } : null);
    setSaved(isStored ? { revision: history.getRevision(), key: settingsKey(project.settings) } : null);
  };

  const closeList = () => {
    list?.forEach((item) => URL.revokeObjectURL(item.thumbnailUrl));
    setList(null);
  };

  const refreshList = async () => {
    const metas = await listProjects();
    list?.forEach((item) => URL.revokeObjectURL(item.thumbnailUrl));
    setList(metas.map((meta) => ({ meta, thumbnailUrl: URL.createObjectURL(meta.thumbnail) })));
  };

  const openList = () => run(refreshList);

  const open = (id: string) =>
    run(async () => {
      if (isDirty && !window.confirm(DISCARD_PROMPT)) return;
      const project = await loadProject(id);
      if (!project) throw new Error("That project no longer exists.");
      await showProject(project, true);
      closeList();
    });

  const rename = (id: string) =>
    run(async () => {
      const item = list?.find((i) => i.meta.id === id);
      const name = window.prompt("New name:", item?.meta.name ?? "")?.trim();
      if (!name) return;
      await dbRename(id, name);
      if (current?.id === id) setCurrent({ ...current, name });
      await refreshList();
    });

  const remove = (id: string) =>
    run(async () => {
      const item = list?.find((i) => i.meta.id === id);
      if (!window.confirm(`Delete "${item?.meta.name ?? "this project"}"? This cannot be undone.`)) return;
      await dbDelete(id);
      if (current?.id === id) {
        // Keep the work on screen, but it is no longer saved anywhere.
        setCurrent(null);
        setSaved(null);
      }
      await refreshList();
    });

  const startFromPhoto = (file: File) =>
    run(async () => {
      if (isDirty && !window.confirm(DISCARD_PROMPT)) return;
      if (!(await host.loadPhoto(file))) throw new Error("Could not read that image.");
      photoRef.current = file;
      history.reset(false);
      setCurrent(null);
      setSaved(null);
    });

  const exportFile = () =>
    run(async () => {
      const name = current?.name ?? (host.settings.fileName.trim() || "trace-project");
      const project = await snapshot(current?.id ?? crypto.randomUUID(), name, current?.createdAt ?? Date.now());
      downloadBlob(await projectToFile(project), `${name}${PROJECT_FILE_EXTENSION}`);
    });

  const importFile = (file: File) =>
    run(async () => {
      if (isDirty && !window.confirm(DISCARD_PROMPT)) return;
      const project = await projectFromFile(file);

      // Store it right away so it shows up in Projects. If storage is full,
      // still open it so the work isn't lost; it just shows as unsaved.
      let stored = true;
      try {
        await saveProject(project);
      } catch (err) {
        stored = false;
        setMessage({ kind: "error", text: errorText(err) });
      }
      await showProject(project, stored);
      closeList();
      if (stored) setMessage({ kind: "info", text: `Imported "${project.name}".` });
    });

  // Optional autosave: only for projects saved once (it needs a name), and
  // only after a quiet period. Every change re-renders and restarts the timer.
  useEffect(() => {
    if (!autosave || !isDirty || !current || busy) return;
    const timer = setTimeout(() => {
      void run(() => writeProject(current, false));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  });

  return {
    currentName: current?.name ?? null,
    isDirty,
    busy,
    message,
    dismissMessage: () => setMessage(null),
    autosave,
    setAutosave,
    list,
    openList,
    closeList,
    startFromPhoto,
    save,
    saveAs,
    open,
    rename,
    remove,
    exportFile,
    importFile,
  };
}
