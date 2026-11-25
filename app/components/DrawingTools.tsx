import type { DrawMode } from "../hooks/useDrawingEngine";
import { BUTTON_PLAIN, DISABLED, SliderControl, ToggleButton, ToolbarGroup } from "./ui";

export interface DrawingToolsProps {
  opacity: number;
  onOpacityChange: (value: number) => void;
  lineWidth: number;
  onLineWidthChange: (value: number) => void;
  eraserWidth: number;
  onEraserWidthChange: (value: number) => void;
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

/** "Drawing" toolbar group: reference opacity, tool sizes, tool choice, history. */
export function DrawingTools(props: DrawingToolsProps) {
  return (
    <ToolbarGroup title="Drawing">
      <div className="flex flex-wrap items-center gap-6">
        <SliderControl
          id="opacity"
          label={`Reference opacity: ${Math.round(props.opacity * 100)}%`}
          min={0.1}
          max={1}
          step={0.05}
          value={props.opacity}
          onChange={props.onOpacityChange}
        />
        <SliderControl
          id="lineWidth"
          label={`Pen thickness: ${props.lineWidth}px`}
          min={1}
          max={10}
          step={1}
          value={props.lineWidth}
          onChange={props.onLineWidthChange}
        />
        <SliderControl
          id="eraserWidth"
          label={`Eraser size: ${props.eraserWidth}px`}
          min={5}
          max={40}
          step={5}
          value={props.eraserWidth}
          onChange={props.onEraserWidthChange}
        />

        <div className="flex items-center gap-2">
          <ToggleButton active={props.mode === "pen"} onClick={() => props.onModeChange("pen")}>
            Pen
          </ToggleButton>
          <ToggleButton
            active={props.mode === "eraser"}
            onClick={() => props.onModeChange("eraser")}
          >
            Eraser
          </ToggleButton>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={props.onUndo} disabled={!props.canUndo} className={`${BUTTON_PLAIN} ${DISABLED}`}>
            Undo
          </button>
          <button onClick={props.onRedo} disabled={!props.canRedo} className={`${BUTTON_PLAIN} ${DISABLED}`}>
            Redo
          </button>
          <button
            onClick={props.onClear}
            disabled={!props.canUndo}
            className={`px-3 py-1.5 rounded-md text-sm border bg-white text-red-600 border-red-300 ${DISABLED}`}
          >
            Clear Drawing
          </button>
        </div>
      </div>
    </ToolbarGroup>
  );
}
