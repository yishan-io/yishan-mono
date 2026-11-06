import { listFiles, listFilesBatch } from "../../../commands/fileCommands";
import type { WorkspaceFileEntry } from "../../../externalApps";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { mergeWorkspaceEntries } from "../fileTreeMerge";
import { normalizeRelativePath } from "../fileTreePaths";
import { applyDirectoryRefreshes, resolveRefreshDirectoryPaths } from "../fileTreeRefreshRules";

type Entries = WorkspaceFileEntry[];
type Waiter = { resolve: (entries: Entries) => void; reject: (error: unknown) => void };
type Pending = { paths: Set<string> | null; waiters: Waiter[] };
/** Only fresh, fully accepted trees may be restored by another lifecycle. */
export type FileTreeSnapshot = { entries: Entries; loadedPaths: string[] };

// The transport has no cancellation API. Retain the lease until the actual RPC
// settles, including across switch-away/back and unmount/remount.
const ordinaryLeases = new Map<string, Promise<void>>();
async function withOrdinaryLease(identity: string, run: () => Promise<void>) {
  const previous = ordinaryLeases.get(identity);
  let release!: () => void;
  const lease = new Promise<void>((resolve) => { release = resolve; });
  ordinaryLeases.set(identity, lease);
  if (previous) await previous;
  try { await run(); }
  finally {
    release();
    if (ordinaryLeases.get(identity) === lease) ordinaryLeases.delete(identity);
  }
}

/** A listing lifecycle ended before its covering work could complete. */
export class FileTreeRefreshCancelledError extends Error {
  constructor() {
    super("Workspace file listing was cancelled");
    this.name = "FileTreeRefreshCancelledError";
  }
}

/** One lifecycle's ordinary queue, visible interim tree and lazy revision fences. */
export class FileTreeRefreshRuntime {
  entries: Entries;
  private loadedPaths: Set<string>;
  private hasRoot: boolean;
  private isDisposed = false;
  private isRunning = false;
  private pending: Pending | null = null;
  private active: Pending | null = null;
  private revision = 0;
  private coveredPaths: string[] = [];
  private lastRequest: Promise<Entries> | null = null;
  private readonly cancellationError = new FileTreeRefreshCancelledError();
  private cancel!: (error: FileTreeRefreshCancelledError) => void;
  private readonly cancellation = new Promise<never>((_, reject) => { this.cancel = reject; });
  private lazyLoads = new Map<string, Promise<void>>();

  constructor(private readonly options: {
    identity: string;
    workspaceId: string;
    snapshot?: FileTreeSnapshot;
    expandedPaths: string[];
    publish: (entries: Entries) => void;
    cache: (snapshot: FileTreeSnapshot | null) => void;
  }) {
    // Intentional cancellation is quiet even when no lazy caller is awaiting it.
    this.cancellation.catch(() => undefined);
    this.entries = options.snapshot?.entries ?? [];
    this.loadedPaths = new Set(options.snapshot?.loadedPaths ?? options.expandedPaths);
    this.hasRoot = Boolean(options.snapshot);
  }

  /** Enqueues a covering request; undefined/empty paths mean full recursive root. */
  refresh = (paths?: string[]): Promise<Entries> => {
    if (this.isDisposed) return this.cancellation;
    this.revision++;
    this.options.cache(null);
    const promise = new Promise<Entries>((resolve, reject) => {
      this.mergePending(paths, { resolve, reject });
    });
    // Callers may fire-and-forget; the pump reports failures, while awaiters
    // still receive rejection instead of an unrelated old cached tree.
    promise.catch(() => undefined);
    this.lastRequest = promise;
    if (!this.isRunning) {
      // fire-and-forget: pump handles transport errors and settles every waiter.
      void this.pump();
    }
    return promise;
  };

  private mergePending(paths?: string[], waiter?: Waiter) {
    if (!this.pending) this.pending = { paths: paths?.length && paths.every((path) => normalizeRelativePath(path)) ? new Set(paths) : null, waiters: [] };
    else if (!paths?.length || paths.some((path) => !normalizeRelativePath(path))) this.pending.paths = null;
    else if (this.pending.paths) for (const path of paths) this.pending.paths.add(path);
    if (waiter) this.pending.waiters.push(waiter);
    return this.pending;
  }

  private async pump() {
    this.isRunning = true;
    while (this.pending && !this.isDisposed) {
      await withOrdinaryLease(this.options.identity, async () => {
        if (this.isDisposed || !this.pending) return;
        const batch = this.pending;
        this.pending = null;
        this.active = batch;
        const changedPaths = batch.paths ? [...batch.paths] : undefined;
        let directories = !this.hasRoot || !changedPaths ? [""]
          : resolveRefreshDirectoryPaths(changedPaths, this.loadedPaths);
        if (directories.includes("")) directories = [""];
        try {
          const response = await listFilesBatch({
            workspaceId: this.options.workspaceId,
            includeFreshness: true,
            requests: directories.map((path) => ({ relativePath: path || undefined, recursive: !path })),
          });
          if (this.isDisposed) return;
          this.revision++;
          const accepted = response.results.filter((listing) => !listing.error);
          const failed = response.results.find((listing) => listing.error);
          const dirty = accepted.filter((listing) => listing.isFresh === false);
          const refreshes = accepted.map((listing) => ({
            directoryPath: normalizeRelativePath(listing.request.relativePath ?? ""), files: listing.files,
          }));
          if (refreshes.length) {
            this.entries = applyDirectoryRefreshes(this.entries, refreshes, this.loadedPaths, changedPaths);
            this.options.publish(this.entries);
          }
          this.coveredPaths = accepted.filter((listing) => listing.isFresh !== false)
            .map((listing) => normalizeRelativePath(listing.request.relativePath ?? ""));
          if (accepted.some((listing) => !listing.request.relativePath && listing.isFresh !== false)) this.hasRoot = true;
          if (failed || !accepted.length) {
            this.hasRoot = false;
            const error = new Error(failed?.error ?? "Empty workspace file response");
            console.error("Failed to load workspace files", error);
            for (const waiter of batch.waiters) waiter.reject(error);
          } else if (dirty.length) {
            // Retry the whole covering scope, not just the last arrival. Full root
            // dominates pending targeted paths, and waiters follow until fresh.
            this.mergePending(changedPaths).waiters.push(...batch.waiters);
          } else {
            for (const waiter of batch.waiters) waiter.resolve(this.entries);
          }
          if (dirty.length && failed) this.mergePending(dirty.map((listing) => listing.request.relativePath || ""));
          if (!failed && !dirty.length && !this.pending && this.hasRoot) this.saveCache();
        } catch (error) {
          if (!this.isDisposed) {
            this.hasRoot = false;
            console.error("Failed to load workspace files", error);
            for (const waiter of batch.waiters) waiter.reject(error);
          }
        } finally { this.active = null; }
      });
    }
    this.isRunning = false;
  }

  private saveCache() {
    this.options.cache({ entries: this.entries, loadedPaths: [...this.loadedPaths] });
  }

  /** Shares lazy work, and waits for newer covering ordinary work before settling. */
  ensurePathLoaded = (path: string): Promise<void> => {
    if (this.isDisposed) return this.cancellation;
    const normalizedPath = normalizeRelativePath(path);
    if (!normalizedPath) return Promise.resolve();
    const loading = this.lazyLoads.get(normalizedPath);
    if (loading) return loading;
    const work = this.loadedPaths.has(normalizedPath)
      ? (this.isRunning && this.lastRequest ? this.lastRequest.then(() => undefined) : Promise.resolve())
      : this.loadDirectory(normalizedPath);
    const promise = Promise.race([work, this.cancellation]).finally(() => this.lazyLoads.delete(normalizedPath));
    // fire-and-forget: loadDirectory/pump report real failures; awaiters retain rejection.
    promise.catch(() => undefined);
    this.lazyLoads.set(normalizedPath, promise);
    return promise;
  };

  private async loadDirectory(path: string) {
    try {
      while (!this.isDisposed) {
        const revision = this.revision;
        const response = await listFiles({ workspaceId: this.options.workspaceId, relativePath: path,
          recursive: false, includeFreshness: true });
        if (this.isDisposed) throw this.cancellationError;
        if (revision !== this.revision) {
          await this.lastRequest;
          if (this.isDisposed) throw this.cancellationError;
          if (this.coveredPaths.some((directory) => !directory || directory === path)) {
            this.loadedPaths.add(path);
            return;
          }
          continue;
        }
        this.entries = response.isFresh === false
          ? mergeWorkspaceEntries(this.entries, response.files)
          : applyDirectoryRefreshes(this.entries, [{ directoryPath: path, files: response.files }], this.loadedPaths);
        this.options.publish(this.entries);
        if (response.isFresh === false) {
          // A shallow loaded ancestor cannot establish freshness for these children.
          await this.refresh();
          if (this.isDisposed) throw this.cancellationError;
        }
        this.loadedPaths.add(path);
        // An in-flight ordinary response owns freshness, even if this shallow
        // load is fresh. Never promote its interim tree into the cache.
        if (this.hasRoot && !this.isRunning && !this.pending) this.saveCache();
        return;
      }
    } catch (error) {
      if (this.isDisposed || error instanceof FileTreeRefreshCancelledError) throw this.cancellationError;
      const message = getErrorMessage(error).toLowerCase();
      if (!this.isDisposed && !["not a directory", "no such file", "enoent", "enotdir"].some((part) => message.includes(part))) {
        console.error("Failed to load workspace directory", { path, error });
        throw error;
      }
    }
  }

  /** Invalidates local publication only; it does not cancel remote filesystem work. */
  dispose() {
    this.isDisposed = true;
    this.cancel(this.cancellationError);
    for (const batch of [this.active, this.pending]) for (const waiter of batch?.waiters ?? []) waiter.reject(this.cancellationError);
    this.pending = null;
  }
}
