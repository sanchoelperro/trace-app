import type { Orientation, PrintLayout } from "@/lib/printLayout";
import { ToolbarGroup } from "./ui";

export interface ExportControlsProps {
  fileName: string;
  onFileNameChange: (value: string) => void;
  canExport: boolean;
  onExport: () => void;
  /** The drawing changed since the last export (shows the amber badge). */
  hasUnexportedWork: boolean;
  layout: PrintLayout;
  orientation: Orientation;
}

/** "Export" toolbar group: PDF file name, export button, export status, print-size note. */
export function ExportControls(props: ExportControlsProps) {
  const { layout } = props;

  return (
    <ToolbarGroup title="Export">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="fileName" className="text-sm text-gray-700 whitespace-nowrap">
            File name:
          </label>
          <input
            id="fileName"
            type="text"
            value={props.fileName}
            onChange={(e) => props.onFileNameChange(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-48"
            placeholder="trace-drawing"
          />
          <span className="text-sm text-gray-400">.pdf</span>
        </div>

        <button
          onClick={props.onExport}
          disabled={!props.canExport}
          className="px-4 py-1.5 rounded-md text-sm border bg-green-600 text-white border-green-600 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:border-gray-400"
        >
          Export PDF
        </button>

        {/* The main "don't lose it" signal: works on every device, iPad included. */}
        {props.hasUnexportedWork ? (
          <span
            role="status"
            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
          >
            Not exported yet
          </span>
        ) : (
          props.canExport && (
            <span role="status" className="text-xs text-gray-500">
              Exported
            </span>
          )
        )}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Your tracing will print at {layout.widthMm.toFixed(0)}mm ×{" "}
        {layout.heightMm.toFixed(0)}mm on 8.5x11in (Letter) {props.orientation} paper
        {layout.hasMargin && " (centered, with a small margin to preserve proportions)"}
        .
      </p>
    </ToolbarGroup>
  );
}
