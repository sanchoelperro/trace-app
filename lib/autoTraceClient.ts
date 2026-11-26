import type { AutoTraceParams } from "./autoTrace";
import type { TraceReply, TraceRequest } from "./autoTrace.worker";
import type { Rect } from "./geometry";

export interface TraceResult {
  /** Black-on-transparent pixels covering `bounds` only; null if no lines. */
  image: ImageData | null;
  bounds: Rect | null;
}

/**
 * Promise-based wrapper around the Auto-Trace worker.
 * (Think of it like a Task-returning service over a message queue.)
 *
 * The worker handles one message at a time in order; each request gets an
 * id so its reply resolves the right promise.
 */
export class AutoTraceClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly waiting = new Map<number, {
    resolve: (r: TraceResult) => void;
    reject: (e: Error) => void;
  }>();

  constructor() {
    // `new URL(..., import.meta.url)` is the bundler-recognised pattern:
    // Next/Turbopack compiles the worker file into its own script.
    this.worker = new Worker(new URL("./autoTrace.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<TraceReply>) => this.handleReply(e.data);
    this.worker.onerror = (e) => this.failAll(new Error(e.message || "Auto-Trace worker crashed"));
  }

  /**
   * Trace an image. The pixel buffer is TRANSFERRED to the worker (no copy),
   * so `pixels` must not be used by the caller afterwards.
   */
  trace(pixels: ImageData, params: AutoTraceParams, outputScale: number): Promise<TraceResult> {
    const id = this.nextId++;
    const request: TraceRequest = {
      id,
      rgba: pixels.data.buffer as ArrayBuffer,
      width: pixels.width,
      height: pixels.height,
      params,
      outputScale,
    };
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage(request, [request.rgba]);
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.failAll(new Error("Auto-Trace was closed"));
  }

  private handleReply(reply: TraceReply): void {
    const entry = this.waiting.get(reply.id);
    if (!entry) return;
    this.waiting.delete(reply.id);

    if (!reply.ok) {
      entry.reject(new Error(reply.error));
      return;
    }
    const image = reply.bounds
      ? new ImageData(new Uint8ClampedArray(reply.rgba), reply.bounds.width, reply.bounds.height)
      : null;
    entry.resolve({ image, bounds: reply.bounds });
  }

  private failAll(error: Error): void {
    for (const entry of this.waiting.values()) entry.reject(error);
    this.waiting.clear();
  }
}
