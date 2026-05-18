/**
 * Service that manages a Web Worker for off-main-thread markdown parsing.
 *
 * Usage:
 *   const html = await markdownWorkerService.parse(content);
 */

import type { MarkdownWorkerRequest, MarkdownWorkerResponse } from "./markdownWorker";

type PendingParse = {
  resolve: (html: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const PARSE_TIMEOUT_MS = 30_000;

/**
 * Inline worker source that shims `document` before importing the actual worker module.
 * This is necessary because Vite's pre-bundled dependencies (remark-parse, etc.)
 * reference `document` at the top level for browser detection, which fails in Workers.
 *
 * The shim must execute before any ES module imports, so we use a blob wrapper
 * that sets the global first, then dynamically imports the real worker.
 */
function createWorkerBlobUrl(): string {
  const workerUrl = new URL("./markdownWorker.ts", import.meta.url).href;
  const source = `
    // Shim document for Vite pre-bundled deps that reference it at module load
    self.document = self.document || { createElementNS: () => ({}), createElement: () => ({ setAttribute: () => {} }), querySelectorAll: () => [] };
    import("${workerUrl}");
  `;
  const blob = new Blob([source], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

class MarkdownWorkerService {
  private worker: Worker | null = null;
  private workerBlobUrl: string | null = null;
  private pendingParses = new Map<string, PendingParse>();
  private nextId = 0;

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }

    this.workerBlobUrl = createWorkerBlobUrl();
    this.worker = new Worker(this.workerBlobUrl, { type: "module" });

    this.worker.addEventListener("message", (event: MessageEvent<MarkdownWorkerResponse>) => {
      const { id, html, error } = event.data;
      if (!id) return;

      const pending = this.pendingParses.get(id);
      if (!pending) return;

      this.pendingParses.delete(id);
      clearTimeout(pending.timer);

      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(html ?? "");
      }
    });

    this.worker.addEventListener("error", (event) => {
      console.error("[MarkdownWorkerService] Worker error", event);
    });

    return this.worker;
  }

  /**
   * Parses markdown content in the worker and returns the rendered HTML string.
   * The main thread is not blocked during parsing.
   */
  parse(content: string): Promise<string> {
    const worker = this.ensureWorker();
    const id = `mp-${++this.nextId}`;

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingParses.has(id)) {
          this.pendingParses.delete(id);
          reject(new Error(`Markdown parse timed out after ${PARSE_TIMEOUT_MS}ms`));
        }
      }, PARSE_TIMEOUT_MS);

      this.pendingParses.set(id, { resolve, reject, timer });

      const request: MarkdownWorkerRequest = { id, content };
      worker.postMessage(request);
    });
  }

  /** Terminates the worker and cleans up pending requests. */
  dispose(): void {
    for (const pending of this.pendingParses.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Markdown worker service disposed"));
    }
    this.pendingParses.clear();

    this.worker?.terminate();
    this.worker = null;

    if (this.workerBlobUrl) {
      URL.revokeObjectURL(this.workerBlobUrl);
      this.workerBlobUrl = null;
    }
  }
}

/**
 * Shared singleton. Survives HMR via globalThis storage.
 */
const GLOBAL_KEY = "__markdownWorkerService__" as const;

function getOrCreateService(): MarkdownWorkerService {
  const global = globalThis as unknown as Record<string, MarkdownWorkerService | undefined>;
  if (global[GLOBAL_KEY]) {
    return global[GLOBAL_KEY];
  }
  const instance = new MarkdownWorkerService();
  global[GLOBAL_KEY] = instance;
  return instance;
}

export const markdownWorkerService = getOrCreateService();
