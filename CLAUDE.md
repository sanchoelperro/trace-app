@AGENTS.md

# Trace & Paint — architecture notes

Personal, fully client-side web app: upload a reference photo, trace it on a
transparent layer (mouse, finger or pen), export only the lines as a PDF on
US Letter. No backend; the photo never leaves the browser.

Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4,
jsPDF. Deployed on Vercel. `@/*` resolves to the repo root (there is no `src/`).
Note: `TRACE_APP_PROJECT_CONTEXT.md` is the original v1 brief and is partly
stale (it says A4/A3 and mouse-only; the app now uses Letter and supports touch).

## Layout

- `app/page.tsx` — owns shared UI state and wires everything together.
- `app/hooks/useDrawingEngine.ts` — pointer input: native listeners, coalesced
  events, rAF batching. Delegates drawing to `lib/strokeRenderer.ts`.
- `app/hooks/useUndoHistory.ts` — region-based undo/redo (backup canvas + patches).
- `app/components/CanvasStack.tsx` — scroll container + stacked canvases.
- `app/components/{DrawingTools,ViewControls,ExportControls}.tsx` — labeled
  toolbar groups (presentational; state comes in as props).
- `app/components/ui.tsx` — shared ToolbarGroup / ToggleButton / SliderControl.
- `lib/printLayout.ts` — pure Letter fit/center math and fit-to-screen zoom.
- `lib/exportPdf.ts` — drawing canvas -> PDF.
- `lib/loadImage.ts` — File -> HTMLImageElement.
- `lib/canvasSize.ts` — 3300 px long-side cap for both canvases.
- `lib/strokeRenderer.ts` — incremental quadratic-midpoint curve drawing of one stroke.
- `lib/strokeSmoothing.ts` — Stabilizer (exponential moving average) for the smoothing slider.
- `lib/geometry.ts` — Point/Rect, BoundsTracker.

## Canvas model

- Two canvases, same pixel size (the photo's, capped at 3300 px long side =
  Letter at 300 dpi, decided with the owner; also avoids iOS Safari's ~16.7 MP
  canvas limit), stacked: reference photo (CSS
  opacity) underneath, transparent drawing layer on top.
- Zoom only changes CSS width/height. Pointer positions are converted from CSS
  pixels to canvas pixels using `canvas.width / rect.width`.
- Only the drawing canvas is exported, so the PDF contains lines only.

## Key decisions

- **Pointer listeners are attached natively, once** (`addEventListener` in a
  `useEffect` that depends only on refs), not as React JSX props. On iPad
  Safari, re-renders from zoom changes were breaking touch input with JSX
  handlers. Native listeners also allow `{ passive: false }` so
  `preventDefault()` reliably blocks scrolling. Anything the listeners read
  that can change (mode, sizes, callbacks) goes through refs
  (`useLatestRef`). Keep this pattern.
- `touch-action: none` on the drawing canvas.
- Drawing pipeline: pointermove only queues points (incl. getCoalescedEvents,
  feature-detected, reading only clientX/Y). A requestAnimationFrame callback
  stabilizes and draws ONLY the new curve pieces. Never re-stroke the whole
  path per move (that was the original iPad choppiness). pointerup flushes
  and draws the last piece to the exact lift point. Settings are read once
  per stroke. Taps draw nothing.
- Undo: a hidden backup canvas mirrors the drawing as of the last recorded
  change. After a stroke, `recordChange(dirtyRect)` stores before (from
  backup) / after (from live) patches of just that rect. Max 10 steps
  (decided with the owner). Clear stores `after: null`. Export/Clear use
  `hasMarks`, not `canUndo`, because history is capped.
- Pen/eraser widths are in canvas pixels, so they look slightly thicker on
  photos that got capped (relative to the image) than before the cap.
- Undo stacks live in refs (large, must not re-render); only `canUndo` /
  `canRedo` are state. Hook functions are stable so listeners can call them.
- Lint uses the React Compiler rules (`react-hooks/refs`): destructure ref
  props instead of reading `props.someRef` in render.
- No new dependencies without asking the owner first.
