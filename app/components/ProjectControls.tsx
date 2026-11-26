import type { ProjectControls as Controls } from "../hooks/useProjects";
import { BUTTON_PLAIN, DISABLED, ToolbarGroup } from "./ui";

/** Shared advice about browser storage not being a safe long-term place. */
export function StorageNote() {
  return (
    <p className="text-xs text-gray-500">
      Projects are stored in this browser only, and Safari may delete them after 7 days without a
      visit. Use <strong>Export project</strong> for backups and to move work between devices. On
      iPad, <strong>Share → Add to Home Screen</strong> keeps saved projects safer.
    </p>
  );
}

/** "Projects" toolbar group: current project, unsaved indicator, save/export, autosave. */
export function ProjectControls({ controls }: { controls: Controls }) {
  const { busy } = controls;

  return (
    <ToolbarGroup title="Projects">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm text-gray-700">
          {controls.currentName ? (
            <>
              Project: <strong>{controls.currentName}</strong>
            </>
          ) : (
            "Not saved yet"
          )}
          {controls.isDirty && <span className="text-amber-600"> • Unsaved changes</span>}
        </span>

        <div className="flex items-center gap-2">
          <button onClick={controls.save} disabled={busy} className={`${BUTTON_PLAIN} ${DISABLED}`}>
            Save
          </button>
          <button onClick={controls.saveAs} disabled={busy} className={`${BUTTON_PLAIN} ${DISABLED}`}>
            Save As…
          </button>
          <button onClick={controls.exportFile} disabled={busy} className={`${BUTTON_PLAIN} ${DISABLED}`}>
            Export project
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={controls.autosave}
            disabled={!controls.currentName}
            onChange={(e) => controls.setAutosave(e.target.checked)}
          />
          Autosave{!controls.currentName && " (after first save)"}
        </label>
      </div>
      <div className="mt-2">
        <StorageNote />
      </div>
    </ToolbarGroup>
  );
}
