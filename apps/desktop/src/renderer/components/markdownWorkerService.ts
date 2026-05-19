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

class MarkdownWorkerService {
  private worker: Worker | null = null;
  private pendingParses = new Map<string, PendingParse>();
  private nextId = 0;

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }

    /**
     * Use Vite's native worker bundling pattern. Vite detects
     * `new Worker(new URL(..., import.meta.url))` at build time and emits
     * markdownWorker.ts as a separate bundled chunk, so the worker URL
     * resolves correctly in both dev and production (file://) contexts.
     *
     * The blob-URL wrapper approach used previously only worked in dev
     * because Vite's dev server could resolve and transpile the raw .ts URL
     * on the fly; in production the .ts file does not exist in the output.
     */
    this.worker = new Worker(new URL("./markdownWorker.ts", import.meta.url), { type: "module" });

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
