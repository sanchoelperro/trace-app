import type { AutoTraceControls } from "../hooks/useAutoTrace";
import { BUTTON_PLAIN, DISABLED, SliderControl, ToolbarGroup } from "./ui";

/**
 * "Auto-Trace" toolbar group. Closed: a single button. Open: sliders with a
 * live (blue) preview over the drawing, plus Apply / Cancel.
 */
export function AutoTracePanel({ controls }: { controls: AutoTraceControls }) {
  const { isOpen, params, setParams, status, error } = controls;
  const busy = status === "applying";

  if (!isOpen) {
    return (
      <ToolbarGroup title="Auto-Trace">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={controls.open} className={BUTTON_PLAIN}>
            Auto-Trace
          </button>
          <span className="text-xs text-gray-500">
            Generate lines from the photo, then fine-tune them by hand.
          </span>
        </div>
      </ToolbarGroup>
    );
  }

  return (
    <ToolbarGroup title="Auto-Trace">
      <div className="flex flex-wrap items-center gap-6">
        <SliderControl
          id="traceDetail"
          label={`Detail: ${params.detail}`}
          min={1}
          max={100}
          step={1}
          value={params.detail}
          onChange={(detail) => setParams({ ...params, detail })}
        />
        <SliderControl
          id="traceSmoothing"
          label={`Smoothing: ${params.smoothing.toFixed(1)}`}
          min={0.5}
          max={5}
          step={0.5}
          value={params.smoothing}
          onChange={(smoothing) => setParams({ ...params, smoothing })}
        />
        <SliderControl
          id="traceSpecks"
          label={`Remove specks: ${params.minLineLength === 0 ? "off" : params.minLineLength}`}
          min={0}
          max={100}
          step={5}
          value={params.minLineLength}
          onChange={(minLineLength) => setParams({ ...params, minLineLength })}
        />
        <SliderControl
          id="traceThickness"
          label={`Line thickness: ${params.thickness}px`}
          min={1}
          max={10}
          step={1}
          value={params.thickness}
          onChange={(thickness) => setParams({ ...params, thickness })}
        />

        <div className="flex items-center gap-2">
          <button
            onClick={controls.apply}
            disabled={busy}
            className={`px-3 py-1.5 rounded-md text-sm border bg-blue-600 text-white border-blue-600 ${DISABLED}`}
          >
            {busy ? "Applying…" : "Apply"}
          </button>
          <button onClick={controls.cancel} disabled={busy} className={`${BUTTON_PLAIN} ${DISABLED}`}>
            Cancel
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {status === "previewing" ? "Updating preview…" : "Preview shown in blue."} More detail finds
        fainter edges; more smoothing ignores texture (try higher for portraits and foliage); remove
        specks drops short bits.
      </p>
      {error && <p className="text-xs text-red-600 mt-1">Auto-Trace failed: {error}</p>}
    </ToolbarGroup>
  );
}
