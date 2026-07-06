# Trace & Paint App — Project Context

## What This App Does
A browser-based tool for tracing reference photos to prepare drawings for watercolor painting. The user uploads an image, traces over it on-screen with a mouse-driven pen tool, then exports the finished line tracing as a print-ready PDF sized exactly to their watercolor paper (A4 or A3) — for transferring onto watercolor paper before painting.

## Workflow (User's Real-World Process)
1. Upload a reference photo/image
2. View image at reduced opacity (like a lightbox/tracing paper)
3. Trace over it using mouse click-and-drag
4. Adjust line thickness, undo mistakes, erase as needed
5. Zoom in for tricky details
6. Once tracing is complete, hide the reference image
7. Export ONLY the traced lines as a PDF, sized to exact A4 or A3 dimensions (1:1 scale — no shrinking/stretching)
8. Print the PDF and use it to transfer the drawing onto watercolor paper (e.g., via graphite transfer)

## Tech Stack (matches user's standard personal-project stack)
- **Framework:** Next.js 15
- **Styling:** Tailwind CSS v4
- **Hosting:** Vercel
- **Backend:** None — fully client-side, image never leaves the browser
- **Drawing surface:** HTML5 Canvas (two layers: reference image layer + drawing layer)
- **PDF export:** jsPDF (or browser print-to-PDF as a fallback), sized to A4/A3 physical dimensions

## Input Method
- **Desktop/laptop with mouse only** (not stylus or touch) — this shapes tool design:
  - Pen tool = click-drag-release to draw a continuous line
  - Undo/redo is essential since mouse tracing is less precise than a stylus
  - Zoom feature is important for precision on detailed areas

## Core Features (v1)
| Feature | Purpose |
|---|---|
| Image upload | Load reference photo (local file, client-side only) |
| Opacity slider | Adjust how faded the reference image appears |
| Pen tool (click-drag) | Draw traced lines over the reference |
| Adjustable line thickness | Control detail vs. bold outlines |
| Undo/redo | Correct mouse-tracing mistakes |
| Eraser tool | Clean up stray lines |
| Zoom/pan | Precision drawing on detailed areas |
| Paper size selector | Choose A4 or A3 for export |
| Export to PDF | Outputs traced lines only, at exact 1:1 scale for chosen paper size |

## Confirmed Decisions
- Input device: **Mouse** (desktop/laptop)
- Tracing style: **Faded reference image + simple pen tool** (not adjustable vector paths for v1)
- Print goal: **Export as PDF sized exactly to watercolor paper dimensions** (A4 or A3)
- Printer capability: **User's printer can print A4/A3 directly** — no tiling/multi-page stitching needed

## Deferred to v2 (not needed for initial build)
- Saving/loading past tracing projects
- Multiple reference images per project
- Color-coded layers for complex subjects
- Support for paper sizes beyond A4/A3

## Development Approach
Following the user's usual workflow: brainstorm and plan with Claude first, then build step-by-step in Cursor using complete file rewrites (Cursor handles partial updates poorly — always provide full file contents, not diffs/snippets).

## Build Plan (Step-by-Step Order)
1. Project setup (Next.js 15 + Tailwind v4 scaffold)
2. Image upload + display on canvas
3. Opacity slider for reference image
4. Pen tool: mouse-driven drawing layer on top of reference
5. Undo/redo + eraser
6. Zoom/pan controls
7. Paper size selector (A4/A3) with correct canvas-to-physical-size mapping
8. PDF export (hide reference layer, export only traced lines at 1:1 scale)
9. Polish: UI layout, styling pass with Tailwind
