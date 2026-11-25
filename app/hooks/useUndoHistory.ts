import { useCallback, useRef, useState, type RefObject } from "react";

export interface UndoHistory {
  canUndo: boolean;
  canRedo: boolean;
  /** Record the current drawing so the next change can be undone. */
  saveSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  /** Forget all history (e.g. when a new photo is loaded). */
  reset: () => void;
}

/**
 * Snapshot-based undo/redo for the drawing canvas.
 *
 * Each entry is a full ImageData copy of the canvas taken *before* a change.
 * Undo swaps the current pixels onto the redo stack and restores the
 * previous ones; redo does the reverse.
 *
 * The stacks live in refs (not state) because they are large and changing
 * them should not re-render the page; only the two booleans are state.
 * All returned functions are stable (useCallback with refs/setters only),
 * so the once-attached pointer listeners can safely call saveSnapshot.
 */
export function useUndoHistory(canvasRef: RefObject<HTMLCanvasElement | null>): UndoHistory {
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const getCanvasAndContext = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    return canvas && ctx ? { canvas, ctx } : null;
  }, [canvasRef]);

  const saveSnapshot = useCallback(() => {
    const target = getCanvasAndContext();
    if (!target) return;
    const { canvas, ctx } = target;

    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    // A new change invalidates anything that was undone before it.
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [getCanvasAndContext]);

  const undo = useCallback(() => {
    const target = getCanvasAndContext();
    if (!target || undoStack.current.length === 0) return;
    const { canvas, ctx } = target;

    redoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(undoStack.current.pop()!, 0, 0);

    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, [getCanvasAndContext]);

  const redo = useCallback(() => {
    const target = getCanvasAndContext();
    if (!target || redoStack.current.length === 0) return;
    const { canvas, ctx } = target;

    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(redoStack.current.pop()!, 0, 0);

    setCanRedo(redoStack.current.length > 0);
    setCanUndo(true);
  }, [getCanvasAndContext]);

  const reset = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  return { canUndo, canRedo, saveSnapshot, undo, redo, reset };
}
