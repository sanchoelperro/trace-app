import { useCallback, useEffect, useRef, useState } from "react";
import type { UndoHistory } from "./useUndoHistory";

export interface UnexportedWork {
  /**
   * True when the drawing has marks that changed since the last PDF export.
   * An empty drawing is never "unexported": there is nothing to lose.
   */
  hasUnexportedWork: boolean;
  /** Call right after the PDF was saved. */
  markExported: () => void;
}

/**
 * Tracks whether the drawing has changed since the last Export PDF, and
 * warns before the tab is closed or reloaded while it has.
 *
 * Uses the undo history's revision counter (bumped once per stroke, erase,
 * Clear, Auto-Trace apply, undo, redo or new photo) instead of comparing
 * pixels. It never changes during a stroke, so this adds no re-renders on
 * pointermove.
 */
export function useUnexportedWork(
  history: Pick<UndoHistory, "hasMarks" | "revision" | "getRevision">
): UnexportedWork {
  const { hasMarks, revision, getRevision } = history;
  /** Revision at the last export; null = never exported. */
  const [exportedRevision, setExportedRevision] = useState<number | null>(null);

  const hasUnexportedWork = hasMarks && revision !== exportedRevision;

  // Mirror for the beforeunload handler, which runs outside React.
  const unexportedRef = useRef(hasUnexportedWork);
  useEffect(() => {
    unexportedRef.current = hasUnexportedWork;
  }, [hasUnexportedWork]);

  // Browser leave-page warning (desktop). Registered only while there is
  // unexported work. Browsers show their own generic text; preventDefault()
  // (plus returnValue for older browsers) is what triggers the dialog.
  // NOTE: iOS Safari does not fire beforeunload, so this does nothing on
  // iPad. The "Not exported yet" indicator and the replace-photo
  // confirmation are the protection there.
  useEffect(() => {
    if (!hasUnexportedWork) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!unexportedRef.current) return;
      e.preventDefault();
      e.returnValue = ""; // legacy: some browsers need a value set to show the dialog
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnexportedWork]);

  const markExported = useCallback(() => setExportedRevision(getRevision()), [getRevision]);

  return { hasUnexportedWork, markExported };
}
