import type { Orientation } from "@/lib/printLayout";
import { BUTTON_PLAIN, ToggleButton, ToolbarGroup } from "./ui";

export interface ViewControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  orientation: Orientation;
  onOrientationChange: (orientation: Orientation) => void;
}

/** "View" toolbar group: zoom buttons and print orientation. */
export function ViewControls(props: ViewControlsProps) {
  return (
    <ToolbarGroup title="View">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <button onClick={props.onZoomOut} className={BUTTON_PLAIN}>
            Zoom Out
          </button>
          <span className="text-sm text-gray-700 w-14 text-center">
            {Math.round(props.zoom * 100)}%
          </span>
          <button onClick={props.onZoomIn} className={BUTTON_PLAIN}>
            Zoom In
          </button>
          <button onClick={props.onFit} className={BUTTON_PLAIN}>
            Fit to Screen
          </button>
        </div>

        <div className="flex items-center gap-2">
          <ToggleButton
            active={props.orientation === "portrait"}
            onClick={() => props.onOrientationChange("portrait")}
          >
            Portrait
          </ToggleButton>
          <ToggleButton
            active={props.orientation === "landscape"}
            onClick={() => props.onOrientationChange("landscape")}
          >
            Landscape
          </ToggleButton>
        </div>
      </div>
    </ToolbarGroup>
  );
}
