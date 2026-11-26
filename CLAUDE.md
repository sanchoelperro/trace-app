@AGENTS.md

# Trace & Paint — architecture notes

Personal, fully client-side web app: upload a reference photo, trace it on a
transparent layer (mouse, finger or pen), export only the lines as a PDF on
US Letter. No backend; the photo never leaves the browser.

Stack: Next.js 16 (App Router, built with **webpack**, see below), React 19, TypeScript, Tailwind v4,
jsPDF. Deployed on Vercel. `@/*` resolves to the repo root (there is no `src/`).
`TRACE_APP_PROJECT_CONTEXT.md` is the plain-language product brief (features,
workflow, decisions, status); keep it in sync when features change.

## Layout

- `app/page.tsx` — owns shared UI state and wires everything together.
- `app/hooks/useDrawingEngine.ts` — pointer input: native listeners, coalesced
  events, rAF batching. Delegates drawing to `lib/strokeRenderer.ts`.
- `app/hooks/useUndoHistory.ts` — region-based undo/redo (backup canvas + patches).
- `app/hooks/useZoom.ts` — zoom state, buttons, anchored zoom (scroll fix-up in useLayoutEffect).
- `app/hooks/useAutoTrace.ts` — Auto-Trace panel state, debounced preview, Apply.
- `app/components/AutoTracePanel.tsx` — Auto-Trace toolbar group (sliders, Apply/Cancel).
- `lib/autoTrace.ts` — pure Canny pipeline (gray, blur, Sobel, NMS, hysteresis, specks, thickness).
- `lib/autoTrace.worker.ts` + `lib/autoTraceClient.ts` — Web Worker and its promise wrapper.
- `app/hooks/useProjects.ts` — save / save as / open / rename / delete / export / import,
  unsaved-changes tracking, beforeunload warning, optional autosave.
- `app/components/ProjectControls.tsx`, `ProjectsDialog.tsx` — Projects toolbar group and list modal.
- `lib/projectStore.ts` — IndexedDB wrapper (no library). `lib/projectFile.ts` — export/import file.
- `lib/projectTypes.ts` — Project/ProjectSettings types, `settingsKey`, `mergeSettings`.
- `lib/canvasBlobs.ts` — canvas -> Blob, thumbnail, `canvasHasMarks`.
- `lib/twoFingerGesture.ts` — pure pan/pinch math (anchor point + zoom from finger distance).
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
- Input state machine in `useDrawingEngine` (idle / drawing / gesture /
  waitRelease). Mouse and pen always draw; touches during a pen/mouse stroke
  are ignored (palm). A 2nd finger during a finger stroke cancels it via
  `discardUncommitted` (backup -> live, no undo entry) and starts a gesture.
  After a gesture, remaining fingers never draw until all lift.
- Pan/pinch: at gesture start, remember the picture point (canvas px) under
  the fingers' midpoint; each frame set zoom = base * distance ratio (after
  a 6% dead zone so pure pans don't zoom) and scroll so that point stays
  under the current midpoint. Current zoom is read from the DOM
  (rect.width / canvas.width) so the engine needs no zoom ref.
- **Build uses webpack** (`next dev --webpack`, `next build --webpack`).
  Turbopack in Next 16.2.10 emits `new Worker(new URL("./x.ts", import.meta.url))`
  as a raw .ts asset instead of compiling it (known 16.2.x regression, reportedly
  fixed in 16.3). Webpack compiles it. After upgrading Next, try removing
  `--webpack` and check that `.next/static/media` has no `autoTrace.worker*.ts`.
- Auto-Trace: preview on a ~1000 px copy drawn (tinted blue) on a third
  canvas with pointer-events none; it never touches the drawing canvas.
  Apply traces the full-res reference canvas, draws via a temp canvas +
  drawImage (source-over keeps existing marks; putImageData would replace
  them), then `recordChange(bounds)` = ONE undo step. Worker returns lines
  cropped to their bounding box. Slider units are defined at a 1000 px
  reference; blur/speck length and gradient gain scale by longSide/1000 so
  full-res results match the preview. Thickness is in drawing-canvas px.
- Projects: IndexedDB db `trace-paint` v1, stores `projects` (meta +
  thumbnail, for the list) and `projectData` (photo + drawing blobs), both
  keyed by id, written in one transaction. The ORIGINAL photo file is stored
  and re-capped on open. Undo history is not stored. IndexedDB is NOT durable
  (Safari evicts after 7 days unvisited unless installed to Home Screen), so
  Export/Import exists: JSON `{format:"trace-paint-project", version:1, ...}`
  with data-URL images, extension `.trace.json`, no zip library (owner's
  decision). Import always gets a new id. Quota errors -> StorageFullError.
- Unsaved changes: `useUndoHistory.revision` bumps on every drawing change;
  dirty = revision or `settingsKey(settings)` differs from the save/open
  marker (zoom excluded). When opening, paint the drawing BEFORE
  `history.reset(hasMarks)` so the undo backup starts from it.
- iOS Safari largely ignores `beforeunload`, so the leave warning mostly
  helps on desktop; autosave/export are the iPad safety nets.
- Pen/eraser widths are in canvas pixels, so they look slightly thicker on
  photos that got capped (relative to the image) than before the cap.
- Undo stacks live in refs (large, must not re-render); only `canUndo` /
  `canRedo` are state. Hook functions are stable so listeners can call them.
- Lint uses the React Compiler rules (`react-hooks/refs`): destructure ref
  props instead of reading `props.someRef` in render.
- No new dependencies without asking the owner first.
