/**
 * Tracks push diagnostics publications and resolves waiters with settle
 * timers, silent-server grace periods, and a hard overall timeout.
 */
import type { LspDiagnostic } from "../types";

/**
 * Default quiet period after the latest publication before settling.
 */
export const DEFAULT_SETTLE_MS = 800;

/**
 * Options for one diagnostics wait.
 */
export interface WaitOptions {
  /**
   * Quiet period after a publication before settling.
   */
  settleMs: number;
  /**
   * Only publications newer than this version count.
   */
  afterVersion?: number;
  /**
   * When set, treat no newer publication after this many milliseconds as
   * the fallback result (a silent push-only server or an empty pull).
   */
  graceMs?: number;
  /**
   * Result used when the grace period elapses without a newer publication.
   */
  fallbackDiagnostics?: LspDiagnostic[];
  /**
   * Hard ceiling for the whole wait.
   */
  overallTimeoutMs: number;
  /**
   * Server name used in error messages.
   */
  serverName: string;
}

interface Publication {
  version: number;
  diagnostics: LspDiagnostic[];
}

/**
 * Accepts push publications per uri and lets callers await a settled
 * diagnostics result.
 */
export class PushDiagnosticsTracker {
  #publications = new Map<string, Publication>();
  #waiters = new Map<
    string,
    Set<{
      onPublish: (publication: Publication) => void;
      reject: (reason: unknown) => void;
      dispose: () => void;
    }>
  >();

  /**
   * Records a publication and notifies waiters for that uri.
   */
  registerPublication(uri: string, diagnostics: LspDiagnostic[]): void {
    const previousVersion = this.#publications.get(uri)?.version ?? 0;
    const publication = { version: previousVersion + 1, diagnostics };
    this.#publications.set(uri, publication);
    const waiters = this.#waiters.get(uri);
    if (waiters) {
      for (const waiter of [...waiters]) waiter.onPublish(publication);
    }
  }

  /**
   * Returns the latest publication version for a uri, or 0 when none.
   */
  versionOf(uri: string): number {
    return this.#publications.get(uri)?.version ?? 0;
  }

  /**
   * Returns whether the latest publication for a uri carries diagnostics.
   */
  hasDiagnostics(uri: string): boolean {
    return (this.#publications.get(uri)?.diagnostics.length ?? 0) > 0;
  }

  /**
   * Waits for a settled diagnostics result for a uri, resolving with the
   * latest publication (or the fallback) and rejecting on the overall
   * timeout or when the tracker is rejected.
   */
  waitForDiagnostics(uri: string, options: WaitOptions): Promise<LspDiagnostic[]> {
    return new Promise<LspDiagnostic[]>((resolve, reject) => {
      let settleTimer: NodeJS.Timeout | undefined;
      let graceTimer: NodeJS.Timeout | undefined;
      let sawNonEmpty = false;
      const afterVersion = options.afterVersion ?? 0;

      const dispose = () => {
        if (settleTimer) clearTimeout(settleTimer);
        if (graceTimer) clearTimeout(graceTimer);
        if (overallTimer) clearTimeout(overallTimer);
        const set = this.#waiters.get(uri);
        set?.delete(waiter);
        if (set && set.size === 0) this.#waiters.delete(uri);
      };
      const settleWith = (diagnostics: LspDiagnostic[]) => {
        dispose();
        resolve(diagnostics);
      };
      const fail = (reason: unknown) => {
        dispose();
        reject(reason);
      };
      const onPublish = (publication: Publication) => {
        if (publication.version <= afterVersion) return;
        // A provisional empty publication must not settle a wait that
        // has a fallback (silent push or empty pull) still pending.
        if (options.fallbackDiagnostics && publication.diagnostics.length === 0 && !sawNonEmpty) {
          return;
        }
        sawNonEmpty ||= publication.diagnostics.length > 0;
        if (graceTimer) clearTimeout(graceTimer);
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => settleWith(this.#publications.get(uri)?.diagnostics ?? []), options.settleMs);
      };

      const waiter = { onPublish, reject: fail, dispose };
      const set = this.#waiters.get(uri) ?? new Set<typeof waiter>();
      set.add(waiter);
      this.#waiters.set(uri, set);

      if (options.graceMs !== undefined) {
        graceTimer = setTimeout(
          () => {
            const latest = this.#publications.get(uri);
            settleWith(
              latest && latest.version > afterVersion ? latest.diagnostics : (options.fallbackDiagnostics ?? []),
            );
          },
          Math.min(options.graceMs, options.overallTimeoutMs),
        );
      }

      const overallTimer = setTimeout(() => {
        const latest = this.#publications.get(uri);
        if (latest && latest.version > afterVersion) {
          settleWith(latest.diagnostics);
        } else if (options.fallbackDiagnostics) {
          settleWith(options.fallbackDiagnostics);
        } else {
          fail(new Error(`${options.serverName} LSP did not return diagnostics for ${uri} before timeout.`));
        }
      }, options.overallTimeoutMs);

      const existing = this.#publications.get(uri);
      if (existing) onPublish(existing);
    });
  }

  /**
   * Rejects every pending waiter, typically when the client closes.
   */
  rejectAll(message: string): void {
    for (const waiters of this.#waiters.values()) {
      for (const waiter of [...waiters]) waiter.reject(new Error(message));
    }
    this.#waiters.clear();
  }
}
