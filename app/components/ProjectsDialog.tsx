/* eslint-disable @next/next/no-img-element -- thumbnails are local blob: URLs; next/image can't optimize them */
import type { ProjectControls } from "../hooks/useProjects";
import { StorageNote } from "./ProjectControls";
import { BUTTON_PLAIN, DISABLED } from "./ui";

/** Modal list of saved projects: thumbnail, name, date; open / rename / delete. */
export function ProjectsDialog({ controls }: { controls: ProjectControls }) {
  const { list, busy } = controls;
  if (!list) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={controls.closeList} // click on the dim background closes
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-4 rounded-md bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()} // clicks inside don't close
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Projects</h2>
          <button onClick={controls.closeList} className={BUTTON_PLAIN}>
            Close
          </button>
        </div>

        <div className="overflow-auto">
          {list.length === 0 ? (
            <p className="text-sm text-gray-500">
              No saved projects yet. Load a photo, draw, and press Save.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {list.map(({ meta, thumbnailUrl }) => (
                <li key={meta.id} className="flex flex-col gap-2 rounded-md border border-gray-300 p-2">
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="h-32 w-full rounded bg-gray-100 object-contain"
                  />
                  <div>
                    <p className="truncate text-sm font-medium text-gray-800" title={meta.name}>
                      {meta.name}
                    </p>
                    <p className="text-xs text-gray-500">{new Date(meta.updatedAt).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => controls.open(meta.id)}
                      disabled={busy}
                      className={`px-3 py-1.5 rounded-md text-sm border bg-blue-600 text-white border-blue-600 ${DISABLED}`}
                    >
                      Open
                    </button>
                    <button onClick={() => controls.rename(meta.id)} disabled={busy} className={`${BUTTON_PLAIN} ${DISABLED}`}>
                      Rename
                    </button>
                    <button
                      onClick={() => controls.remove(meta.id)}
                      disabled={busy}
                      className={`px-3 py-1.5 rounded-md text-sm border bg-white text-red-600 border-red-300 ${DISABLED}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <StorageNote />
      </div>
    </div>
  );
}
