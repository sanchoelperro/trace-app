# Trace & Paint App — Project Context

> Updated after batch 2 (branch `feature/batch-2`). For code-level architecture
> and the reasoning behind technical decisions, see `CLAUDE.md`.

## What This App Does
A browser-based tool for tracing reference photos to prepare drawings for watercolor painting. The user uploads an image, traces over it on-screen with a mouse, finger or Apple Pencil (or lets Auto-Trace draw the lines first), then exports only the line tracing as a print-ready PDF on US Letter paper. The PDF is used to transfer the drawing onto watercolor paper before painting. Projects can be saved in the browser and reopened later.

## Workflow (User's Real-World Process)
1. Upload a reference photo, or reopen a saved project
2. View the image at reduced opacity (like a lightbox/tracing paper)
3. Optionally run Auto-Trace to get a first set of outlines, tune it, and apply it
4. Trace over it (mouse click-drag, finger, or pen), with optional stroke smoothing
5. Adjust line thickness, undo mistakes, erase as needed
6. Zoom in for tricky details (buttons, or two-finger pinch/pan on iPad)
7. Save the project (and/or export it as a file as a backup) to continue later
8. Export ONLY the traced lines as a PDF on US Letter (portrait or landscape), fitted to the page and centered with the aspect ratio kept
9. Print the PDF and transfer the drawing onto watercolor paper (e.g., via graphite transfer)

## Tech Stack
- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Build:** webpack (`next dev --webpack` / `next build --webpack`). Turbopack in Next 16.2.x does not compile the Auto-Trace Web Worker; can switch back after upgrading Next (see `CLAUDE.md`)
- **Styling:** Tailwind CSS v4
- **Hosting:** Vercel (pushing a branch creates a preview deployment)
- **Backend:** None. Fully client-side; the photo never leaves the browser
- **Drawing surface:** HTML5 Canvas. Three stacked layers: reference photo, transparent drawing layer, Auto-Trace preview layer (ignores input)
- **PDF export:** jsPDF, US Letter
- **Storage:** IndexedDB (browser), plus an export/import `.trace.json` file
- **Dependencies:** no new libraries added in batch 2. Ask before adding any

## Input Methods
- **Desktop mouse:** click-drag-release draws a line. Always draws.
- **iPad finger / Apple Pencil:** one finger or the pen draws. Pen strokes ignore touches from a resting palm.
- **Two fingers:** pan and pinch-zoom around the point between the fingers. Adding a second finger mid-stroke cancels that stroke (no undo entry). A small dead zone keeps a plain pan from also zooming.

## Features
| Feature | Notes |
|---|---|
| Image upload | Local file, client-side only. Large photos are scaled down to 3300 px on the long side (Letter at 300 dpi; also stays under iPad Safari's canvas limit) |
| Opacity slider | How faded the reference image appears |
| Pen tool | Smooth curves, drawn incrementally so it stays fast on iPad |
| Stroke smoothing slider | 0 = off; higher values steady shaky lines |
| Line thickness / eraser size | In canvas pixels |
| Eraser tool | Clean up stray lines |
| Undo/redo | Up to 10 steps; stores only the changed area of each stroke |
| Clear | Undoable |
| Zoom | Zoom in/out buttons, Fit to screen, two-finger pinch on touch devices |
| Orientation | Portrait or landscape Letter page |
| Auto-Trace | Edge detection (Canny) runs in the background. Sliders: Detail, Smoothing, Remove specks, Line thickness. Blue live preview; Apply draws the lines onto the drawing as ONE undo step; Cancel discards |
| Projects | Save, Save As, Projects list (open, rename, delete) with thumbnails. Stores the original photo, drawing and all settings (not undo history) |
| Unsaved changes | Indicator, leave-page warning (desktop browsers; iPad Safari mostly ignores it), optional autosave |
| Export/Import project | One `.trace.json` file. Needed as a backup because browser storage is not permanent |
| Export to PDF | Traced lines only, on Letter, fitted and centered |

## Confirmed Decisions
- Paper: **US Letter** (replaces the original A4/A3 plan); fit to page, centered
- Input: **mouse, finger and pen** (iPad is a primary target, not just desktop)
- Tracing style: faded reference image + freehand pen (no vector paths)
- Canvas size cap: **3300 px** on the long side
- Undo limit: **10 steps**
- Project file: **plain JSON** with embedded images, no zip library
- Build with **webpack** until the Turbopack worker bug is fixed
- Storage caveat: Safari may delete IndexedDB data for sites not visited in 7 days (unless the app is added to the Home Screen). Use Export project for anything important.

## Status
- Batch 1 (v1): upload, opacity, pen, eraser, undo/redo, zoom, orientation, Letter PDF export, touch support.
- Batch 2 (done, on `feature/batch-2`), one commit per phase:
  - Phase 0: refactor (no behavior change)
  - Phase 1: smoother iPad drawing, stroke smoothing, region-based undo, 3300 px cap
  - Phase 2: two-finger pan/pinch-zoom
  - Phase 3: Auto-Trace
  - Phase 4: saved projects + export/import
- Tested on desktop by the owner and with an automated browser smoke test. **iPad testing still pending.**

## Still Deferred / Ideas
- Multiple reference images per project
- Color-coded layers for complex subjects
- Paper sizes other than Letter
- Vector (editable) paths

## Development Approach
Plan with Claude first, then build in phases on a feature branch: one commit per phase, build and lint must pass, and stop for owner testing before starting the next phase. Run locally with `npm run dev` (http://localhost:3000). Pushing the branch deploys a Vercel preview.
