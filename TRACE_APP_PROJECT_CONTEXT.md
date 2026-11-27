# Trace & Paint App — Project Context

> Current as of 2026-11-27: batch 2 plus the Projects removal, all merged
> into `main` and live. For code-level architecture and the reasoning behind
> technical decisions, see `CLAUDE.md`.

## What This App Does
A browser-based tool for tracing reference photos to prepare drawings for watercolor painting. The user uploads an image, traces over it on-screen with a mouse, finger or Apple Pencil (or lets Auto-Trace draw the lines first), then exports only the line tracing as a print-ready PDF on US Letter paper. The PDF is used to transfer the drawing onto watercolor paper before painting. Nothing is saved in the browser: the PDF is the only way to keep a drawing, so the app warns about work that hasn't been exported yet.

## Workflow (User's Real-World Process)
1. Upload a reference photo
2. View the image at reduced opacity (like a lightbox/tracing paper)
3. Optionally run Auto-Trace to get a first set of outlines, tune it, and apply it
4. Trace over it (mouse click-drag, finger, or pen), with optional stroke smoothing
5. Adjust line thickness, undo mistakes, erase as needed
6. Zoom in for tricky details (buttons, or two-finger pinch/pan on iPad)
7. Export ONLY the traced lines as a PDF on US Letter (portrait or landscape), fitted to the page and centered with the aspect ratio kept. Until you do, the app shows "Not exported yet"; the PDF is the only saved copy
8. Print the PDF and transfer the drawing onto watercolor paper (e.g., via graphite transfer)

## Tech Stack
- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Build:** webpack (`next dev --webpack` / `next build --webpack`). Turbopack in Next 16.2.x does not compile the Auto-Trace Web Worker; can switch back after upgrading Next (see `CLAUDE.md`)
- **Styling:** Tailwind CSS v4
- **Hosting:** Vercel (pushing a branch creates a preview deployment; pushing `main` updates production)
- **Backend:** None. Fully client-side; the photo never leaves the browser
- **Drawing surface:** HTML5 Canvas. Three stacked layers: reference photo, transparent drawing layer, Auto-Trace preview layer (ignores input)
- **PDF export:** jsPDF, US Letter
- **Storage:** none. Work lives only on screen until exported to PDF
- **Dependencies:** jsPDF is the only runtime library besides Next/React. Ask before adding any

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
| Export to PDF | Traced lines only, on Letter, fitted and centered |
| Unexported-work warning | Amber "Not exported yet" badge next to Export PDF whenever the drawing has lines that changed since the last export; grey "Exported" after exporting; nothing when the drawing is empty. Works everywhere, incl. iPad. Picking a new photo over unexported work asks "Your current drawing has not been exported to PDF. Replace it anyway?" (Cancel / Replace). Desktop browsers also warn before closing/reloading the tab (iPad Safari doesn't support that) |

## Confirmed Decisions
- Paper: **US Letter** (replaces the original A4/A3 plan); fit to page, centered
- Input: **mouse, finger and pen** (iPad is a primary target, not just desktop)
- Tracing style: faded reference image + freehand pen (no vector paths)
- Canvas size cap: **3300 px** on the long side
- Undo limit: **10 steps**
- Build with **webpack** until the Turbopack worker bug is fixed
- **No saved projects** (Phase 4 was removed by the owner on 2026-11-27). Don't reintroduce browser storage without asking
- "Unexported" = drawing has marks and changed since the last PDF export, tracked with a revision counter, not pixel comparison. So undoing back to exactly the exported drawing still shows "Not exported yet" (accepted trade-off)

## Status
- Batch 1 (v1): upload, opacity, pen, eraser, undo/redo, zoom, orientation, Letter PDF export, touch support.
- Batch 2 (merged into `main` 2026-11-25), one commit per phase:
  - Phase 0: refactor (no behavior change)
  - Phase 1: smoother iPad drawing, stroke smoothing, region-based undo, 3300 px cap
  - Phase 2: two-finger pan/pinch-zoom
  - Phase 3: Auto-Trace
  - Phase 4: saved projects + export/import (later removed)
- Projects removal + unexported-work warning (merged into `main` 2026-11-27, commit `b5b818c`).
- Tested on desktop by the owner and with automated browser smoke tests. **iPad testing still pending** for batch 2 and the warning (check: badge after drawing, "Exported" after export, replace-photo prompt).

## Still Deferred / Ideas
- Multiple reference images per drawing
- Color-coded layers for complex subjects
- Paper sizes other than Letter
- Vector (editable) paths

## Development Approach
Plan with Claude first, then build on a branch off `main` (one per change, e.g. `feature/...` or `chore/...`). Multi-phase work: one commit per phase, typecheck/lint/build must pass, and stop for owner testing before starting the next phase. Commit, push, merge and branch deletion only when the owner asks; when done, fast-forward `main`, push it, and delete the branch locally and on GitHub. No pull requests. Run locally with `npm run dev` (http://localhost:3000). Pushing a branch deploys a Vercel preview.
