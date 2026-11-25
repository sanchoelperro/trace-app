// Small presentational building blocks shared by the toolbar groups.
// They reproduce the exact Tailwind classes used before the refactor.

import type { ReactNode } from "react";

export const BUTTON_BASE = "px-3 py-1.5 rounded-md text-sm border";
export const BUTTON_PLAIN = `${BUTTON_BASE} bg-white text-gray-700 border-gray-300`;
const BUTTON_ACTIVE = `${BUTTON_BASE} bg-blue-600 text-white border-blue-600`;
export const DISABLED = "disabled:opacity-40 disabled:cursor-not-allowed";

/** A labeled section of the toolbar ("Drawing", "View", ...). */
export function ToolbarGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

/** A button that shows a highlighted style when selected (radio-like). */
export function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button onClick={onClick} className={active ? BUTTON_ACTIVE : BUTTON_PLAIN}>
      {children}
    </button>
  );
}

/** A range slider with a text label to its left. */
export function SliderControl({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="text-sm text-gray-700 whitespace-nowrap">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-40"
      />
    </div>
  );
}
