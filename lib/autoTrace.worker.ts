// Web Worker entry: runs Auto-Trace off the main thread so the page stays
// responsive (a full-resolution trace can take a second or more on an iPad).

import { traceEdges, type AutoTraceParams } from "./autoTrace";
import type { Rect } from "./geometry";

export interface TraceRequest {
  /** Lets the page match replies to requests and ignore stale previews. */
  id: number;
  rgba: ArrayBuffer;
  width: number;
  height: number;
  params: AutoTraceParams;
  outputScale: number;
}

export type TraceReply =
  | { id: number; ok: true; rgba: ArrayBuffer; bounds: Rect | null }
  | { id: number; ok: false; error: string };

// The project's TypeScript config uses the DOM lib, where `self` is a Window.
// We only need these two members of the worker global scope.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<TraceRequest>) => void) | null;
  postMessage: (message: TraceReply, transfer: Transferable[]) => void;
};

scope.onmessage = (e) => {
  const req = e.data;
  try {
    const result = traceEdges({
      rgba: new Uint8ClampedArray(req.rgba),
      width: req.width,
      height: req.height,
      params: req.params,
      outputScale: req.outputScale,
    });
    // Transfer the buffer (move ownership, no copy) back to the page.
    const buffer = result.rgba.buffer as ArrayBuffer;
    scope.postMessage({ id: req.id, ok: true, rgba: buffer, bounds: result.bounds }, [buffer]);
  } catch (err) {
    scope.postMessage({ id: req.id, ok: false, error: String(err) }, []);
  }
};
