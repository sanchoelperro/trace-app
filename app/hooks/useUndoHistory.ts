import { useCallback, useRef, useState, type RefObject } from "react";
import { fullRect, type Rect } from "@/lib/geometry";

/** How many steps can be undone. Older steps are dropped. */
export const MAX_UNDO_STEPS = 10;

/**
 * One undoable change: the pixels of `rect` before and after it.
 * `after === null` means "the area became fully transparent" (Clear), which
 * saves storing a big empty image.
 */
interface HistoryEntry {
  rect: Rect;
  before: ImageData;
  after: ImageData | null;
  /** Whether the drawing had any marks before / after (drives Export/Clear). */
  hadMarksBefore: boolean;
  hasMarksAfter: boolean;
}

export interface UndoHistory {
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Whether the drawing (probably) has marks. Export and Clear use this
   * instead of canUndo, because the undo history is capped and may be empty
   * even when the canvas has lines.
   */
  hasMarks: boolean;
  /**
   * Increases on every change to the drawing (stroke, clear, undo, redo,
   * reset). Comparing it with the value at the last PDF export tells
   * whether the drawing has unexported changes. Updated once per change,
   * never per pointermove.
   */
  revision: number;
  /** Same as `revision`, but current immediately (not after a re-render). */
  getRevision: () => number;
  /** Call AFTER drawing into `changed`, to make that change undoable. */
  recordChange: (changed: Rect) => void;
  /**
   * Undo an UNRECORDED change in `rect` (e.g. a stroke cancelled by a second
   * finger) by copying the backup back. Leaves the history untouched.
   */
  discardUncommitted: (rect: Rect) => void;
  /** Erase the whole drawing as one undoable step. */
  clearWithUndo: () => void;
  undo: () => void;
  redo: () => void;
  /** Forget all history; call after the drawing canvas was resized/reset. */
  reset: () => void;
}

/** Draw `data` into `ctx` at `rect`, or clear `rect` if `data` is null. */
function putRegion(ctx: CanvasRenderingContext2D, rect: Rect, data: ImageData | null): void {
  if (data) ctx.putImageData(data, rect.x, rect.y);
  else ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
}

/**
 * Undo/redo for the drawing canvas that stores only the changed area.
 *
 * HOW IT WORKS: we keep a hidden "backup" canvas that always equals the
 * drawing as of the last recorded change. While a stroke is being drawn
 * on the visible canvas, the backup still holds the "before" state. When
 * the stroke ends we know its bounding box, so we copy just that box from
 * the backup (before) and from the live canvas (after), and then bring the
 * backup up to date.
 *
 * WHY: the old approach copied the FULL canvas at every stroke start
 * (~34 MB at 3300x2550) and kept unlimited copies, which is slow and runs
 * iPads out of memory. A typical stroke's box is a small fraction of that.
 * The backup costs one extra canvas of memory, once.
 *
 * The stacks live in refs (large, must not trigger re-renders); only the
 * three booleans are state. All returned functions are stable, so the
 * once-attached pointer listeners can safely hold on to them.
 */
export function useUndoHistory(canvasRef: RefObject<HTMLCanvasElement | null>): UndoHistory {
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const backupRef = useRef<CanvasRenderingContext2D | null>(null);
  const hasMarksRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasMarks, setHasMarksState] = useState(false);
  const revisionRef = useRef(0);
  const [revision, setRevision] = useState(0);

  const bumpRevision = useCallback(() => {
    revisionRef.current += 1;
    setRevision(revisionRef.current);
  }, []);

  const getRevision = useCallback(() => revisionRef.current, []);

  const setHasMarks = useCallback((value: boolean) => {
    hasMarksRef.current = value;
    setHasMarksState(value);
  }, []);

  /** Refresh button state after any change; every change is a new revision. */
  const syncButtons = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
    bumpRevision();
  }, [bumpRevision]);

  /** Live canvas context plus a backup context of the same size. */
  const getContexts = useCallback(() => {
    const canvas = canvasRef.current;
    const live = canvas?.getContext("2d");
    if (!canvas || !live) return null;

    let backup = backupRef.current;
    if (!backup || backup.canvas.width !== canvas.width || backup.canvas.height !== canvas.height) {
      const backupCanvas = document.createElement("canvas");
      backupCanvas.width = canvas.width;
      backupCanvas.height = canvas.height;
      // willReadFrequently keeps this canvas in CPU memory, making the
      // getImageData calls below fast. We don't set it on the visible canvas
      // because that would slow down drawing there.
      backup = backupCanvas.getContext("2d", { willReadFrequently: true });
      if (!backup) return null;
      backup.drawImage(canvas, 0, 0); // start in sync with the live drawing
      backupRef.current = backup;
    }
    return { live, backup };
  }, [canvasRef]);

  const pushEntry = useCallback(
    (entry: HistoryEntry) => {
      undoStack.current.push(entry);
      if (undoStack.current.length > MAX_UNDO_STEPS) undoStack.current.shift();
      // A new change invalidates anything that was undone before it.
      redoStack.current = [];
      setHasMarks(entry.hasMarksAfter);
      syncButtons();
    },
    [setHasMarks, syncButtons]
  );

  const recordChange = useCallback(
    (rect: Rect) => {
      const ctxs = getContexts();
      if (!ctxs) return;
      const { live, backup } = ctxs;

      const before = backup.getImageData(rect.x, rect.y, rect.width, rect.height);
      const after = live.getImageData(rect.x, rect.y, rect.width, rect.height);
      backup.putImageData(after, rect.x, rect.y); // backup now matches the live canvas

      pushEntry({ rect, before, after, hadMarksBefore: hasMarksRef.current, hasMarksAfter: true });
    },
    [getContexts, pushEntry]
  );

  const discardUncommitted = useCallback(
    (rect: Rect) => {
      const ctxs = getContexts();
      if (!ctxs) return;
      // The backup still holds the state from before the stroke started.
      // putImageData replaces pixels exactly (ignores blending), which is
      // what we want for both drawn and erased areas.
      const before = ctxs.backup.getImageData(rect.x, rect.y, rect.width, rect.height);
      ctxs.live.putImageData(before, rect.x, rect.y);
    },
    [getContexts]
  );

  const clearWithUndo = useCallback(() => {
    const ctxs = getContexts();
    if (!ctxs) return;
    const { live, backup } = ctxs;
    const rect = fullRect(live.canvas);

    const before = backup.getImageData(rect.x, rect.y, rect.width, rect.height);
    putRegion(live, rect, null);
    putRegion(backup, rect, null);

    pushEntry({ rect, before, after: null, hadMarksBefore: hasMarksRef.current, hasMarksAfter: false });
  }, [getContexts, pushEntry]);

  const undo = useCallback(() => {
    const ctxs = getContexts();
    const entry = undoStack.current.pop();
    if (!ctxs || !entry) return;

    putRegion(ctxs.live, entry.rect, entry.before);
    putRegion(ctxs.backup, entry.rect, entry.before);
    redoStack.current.push(entry);
    setHasMarks(entry.hadMarksBefore);
    syncButtons();
  }, [getContexts, setHasMarks, syncButtons]);

  const redo = useCallback(() => {
    const ctxs = getContexts();
    const entry = redoStack.current.pop();
    if (!ctxs || !entry) return;

    putRegion(ctxs.live, entry.rect, entry.after);
    putRegion(ctxs.backup, entry.rect, entry.after);
    undoStack.current.push(entry);
    setHasMarks(entry.hasMarksAfter);
    syncButtons();
  }, [getContexts, setHasMarks, syncButtons]);

  const reset = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    // Recreate the backup NOW, while it can copy the current (fresh) canvas.
    // Creating it lazily at the end of the first stroke would capture that
    // stroke as the "before" state, making it impossible to undo.
    backupRef.current = null;
    getContexts();
    setHasMarks(false);
    syncButtons();
  }, [getContexts, setHasMarks, syncButtons]);

  return { canUndo, canRedo, hasMarks, revision, getRevision, recordChange, discardUncommitted, clearWithUndo, undo, redo, reset };
}
