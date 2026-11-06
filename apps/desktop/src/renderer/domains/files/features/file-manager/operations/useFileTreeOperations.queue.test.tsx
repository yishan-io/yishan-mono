// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileTreeStore } from "../../../state/fileTreeStore";
import { FileTreeRows } from "../file-tree/FileTreeRows";
import type { ComponentProps } from "react";
import { FileTreeRefreshRuntime, type FileTreeSnapshot } from "./fileTreeRefreshRuntime";
import { useFileTreeOperations } from "./useFileTreeOperations";

const mocks = vi.hoisted(() => ({
  selectedId: "a",
  workspaces: [{ id: "a", worktreePath: "/a", nodeId: "node" }, { id: "b", worktreePath: "/b", nodeId: "node" }],
  batch: vi.fn(), lazy: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn(), open: vi.fn(),
}));
vi.mock("@renderer/domains/files/commands/fileCommands", async (original) => ({
  ...await original<typeof import("../../../commands/fileCommands")>(),
  createFile: (...args: unknown[]) => mocks.create(...args),
  renameEntry: (...args: unknown[]) => mocks.rename(...args),
  deleteEntry: (...args: unknown[]) => mocks.remove(...args),
  listFilesBatch: (...args: unknown[]) => mocks.batch(...args),
  listFiles: (...args: unknown[]) => mocks.lazy(...args),
}));
vi.mock("@renderer/domains/workspace", async (original) => ({
  ...await original<typeof import("@renderer/domains/workspace")>(),
  workspaceStore: Object.assign((select: (state: unknown) => unknown) => select({ workspaces: mocks.workspaces }), {
    getState: () => ({ workspaces: mocks.workspaces }),
  }),
}));
vi.mock("@renderer/domains/workbench", async (original) => ({
  ...await original<typeof import("@renderer/domains/workbench")>(),
  workbenchNavigationStore: Object.assign(
    (select: (state: unknown) => unknown) => select({ activeWorkspaceId: mocks.selectedId }),
    { getState: () => ({ activeWorkspaceId: mocks.selectedId }) },
  ),
  openTab: (...args: unknown[]) => mocks.open(...args),
  tabStore: (select: (state: unknown) => unknown) => select({ tabs: [] }),
}));

type Batch = {
  results: Array<{ request: { relativePath?: string }; files: ReturnType<typeof entries>; isFresh?: boolean; error?: string }>;
};
function entries(paths: string[]) {
  return paths.map((path) => ({ path, name: path, isDir: path.endsWith("/"), isIgnored: false,
    size: 0, mode: 0, modifiedAt: "" }));
}
function response(paths: string[], isFresh = true, relativePath = ""): Batch {
  return { results: [{ request: { relativePath }, files: entries(paths), isFresh }] };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
async function change(paths: string[] = []) {
  await act(async () => {
    fileTreeStore.setState((state) => ({
      fileTreeRefreshVersion: state.fileTreeRefreshVersion + 1,
      fileTreeChangedRelativePathsByWorktreePath: { "/a": paths },
    }));
  });
}

describe("ordinary file-tree queue through operations", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue(undefined); mocks.rename.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockReset().mockResolvedValue(undefined); mocks.open.mockReset();
    mocks.selectedId = "a";
    mocks.workspaces = [{ id: "a", worktreePath: "/a", nodeId: "node" }, { id: "b", worktreePath: "/b", nodeId: "node" }];
    mocks.batch.mockReset().mockResolvedValue(response(["src/", "src/old.ts", "lib/", "lib/old.ts"]));
    mocks.lazy.mockReset().mockImplementation(({ relativePath }: { relativePath: string }) =>
      Promise.resolve({ files: entries([`${relativePath}/old.ts`]), isFresh: true }));
    fileTreeStore.setState({ fileTreeRefreshVersion: 0, fileTreeChangedRelativePathsByWorktreePath: {},
      expandedFileTreeItemsByWorkspaceId: {} });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it.each(["switch", "root", "relink", "unmount"])("does not continue a blocked create after %s", async (kind) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const hook = renderHook(useFileTreeOperations); await flush();
    const blocked = deferred<void>(); mocks.create.mockReturnValueOnce(blocked.promise);
    let operation!: Promise<void>;
    act(() => { operation = hook.result.current.onCreateFile("same.ts"); });
    if (kind === "unmount") hook.unmount();
    else {
      if (kind === "switch") mocks.selectedId = "b";
      if (kind === "root") mocks.workspaces[0]!.worktreePath = "/new";
      if (kind === "relink") mocks.workspaces[0]!.nodeId = "other";
      hook.rerender();
    }
    await flush(); const calls = mocks.batch.mock.calls.length;
    await act(async () => { blocked.resolve(); await operation; });
    expect(mocks.batch).toHaveBeenCalledTimes(calls);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(hook.result.current.canUndoLastEntryOperation).toBe(false);
    await act(async () => { await hook.result.current.onUndoLastEntryOperation(); });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("keeps current creates usable and reports real active move failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const hook = renderHook(useFileTreeOperations); await flush();
    await act(async () => { await hook.result.current.onCreateFile("same.ts"); });
    expect(mocks.open).toHaveBeenCalled(); expect(hook.result.current.canUndoLastEntryOperation).toBe(true);
    mocks.rename.mockRejectedValueOnce(new Error("move denied"));
    await act(async () => { await hook.result.current.onMoveEntries(["same.ts"], "src"); });
    expect(hook.result.current.fileOperationError).toContain("move denied");
  });

  it("does not publish cancellation errors from a move refresh into the new workspace", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const hook = renderHook(useFileTreeOperations); await flush();
    const blocked = deferred<Batch>(); mocks.batch.mockReturnValueOnce(blocked.promise);
    let operation!: Promise<void>;
    act(() => { operation = hook.result.current.onMoveEntries(["same.ts"], "src"); });
    await flush(); mocks.selectedId = "b"; hook.rerender(); await flush();
    await act(async () => { await operation; blocked.resolve(response(["old.ts"])); });
    expect(hook.result.current.fileOperationError).toBeNull();
    expect(hook.result.current.canUndoLastEntryOperation).toBe(false);
  });

  it.each(["switch", "unmount"])("handles actual row lazy cancellation after %s", async (kind) => {
    const hook = renderHook(useFileTreeOperations); await flush();
    const blocked = deferred<{ files: ReturnType<typeof entries> }>(); mocks.lazy.mockReturnValueOnce(blocked.promise);
    const noop = () => undefined;
    const props: ComponentProps<typeof FileTreeRows> = {
      visibleRows: [{ path: "src", name: "src", isDirectory: true, depth: 0, hasChildren: true }],
      virtualizer: { getTotalSize: () => 24, getVirtualItems: Object.assign(() => [
        { index: 0, key: "src", start: 0, end: 24, size: 24, lane: 0 },
      ], { updateDeps: noop }), measureElement: noop },
      expandedPathSet: new Set(), selectedPaths: new Set(), focusedPath: "", ignoredPathSet: new Set(),
      gitChangesByPath: {}, ancestorOfGitChangePaths: new Set(), editingEntry: null, editingName: "",
      editingInputRef: { current: null }, dropTargetPath: null, setExpandedItems: noop,
      handleRowClick: noop, handleRowDragStart: noop, onEnsurePathLoaded: hook.result.current.ensurePathLoaded,
      startCreate: noop, startRename: noop, setEditingName: noop, handleRenameInputKeyDown: noop,
      handleRenameInputBlur: noop, handleExternalDragOver: noop, handleRowDragEnter: noop,
      handleRowDragLeave: noop, handleExternalDrop: async () => undefined,
    };
    const row = render(<FileTreeRows {...props} />);
    fireEvent.doubleClick(row.getByText("src")); await flush();
    expect(mocks.lazy).toHaveBeenCalledTimes(1);
    if (kind === "unmount") { row.unmount(); hook.unmount(); }
    else { mocks.selectedId = "b"; hook.rerender(); }
    await flush(); await act(async () => blocked.resolve({ files: entries(["src/old.ts"]) }));
  });

  it("bounds a blocked burst to one active batch and one unioned pending followup, publishing every completion", async () => {
    const hook = renderHook(useFileTreeOperations);
    await flush();
    await act(async () => { await hook.result.current.ensurePathLoaded("src"); await hook.result.current.ensurePathLoaded("lib"); });
    const first = deferred<Batch>(); const next = deferred<Batch>();
    mocks.batch.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    await change(["src/old.ts"]);
    for (let i = 0; i < 10; i++) await change([i % 2 ? "src/new.ts" : "lib/new.ts"]);
    expect(mocks.batch).toHaveBeenCalledTimes(2);
    await act(async () => first.resolve(response(["src/interim.ts"], true, "src")));
    expect(hook.result.current.repoFiles).toContain("src/interim.ts");
    expect(mocks.batch).toHaveBeenCalledTimes(3);
    expect(mocks.batch.mock.calls[2]?.[0].requests).toEqual([
      { relativePath: "lib", recursive: false }, { relativePath: "src", recursive: false },
    ]);
    await act(async () => next.resolve(response(["lib/new.ts"], true, "lib")));
  });

  it("preserves every same-batch invalidation while a dirty refresh is blocked", async () => {
    const hook = renderHook(useFileTreeOperations); await flush();
    await act(async () => {
      for (const path of ["src", "lib", "docs"]) await hook.result.current.ensurePathLoaded(path);
    });
    const active = deferred<Batch>(); const follow = deferred<Batch>();
    mocks.batch.mockReturnValueOnce(active.promise).mockReturnValueOnce(follow.promise);
    await change(["src/old.ts"]);
    act(() => {
      fileTreeStore.getState().incrementFileTreeRefreshVersion("/a", ["lib/added.ts"]);
      fileTreeStore.getState().incrementFileTreeRefreshVersion("/a", ["docs/added.ts"]);
    });
    expect(mocks.batch).toHaveBeenCalledTimes(2);
    await act(async () => active.resolve(response(["src/interim.ts"], false, "src")));
    expect(mocks.batch.mock.calls[2]?.[0].requests).toEqual([
      { relativePath: "docs", recursive: false }, { relativePath: "lib", recursive: false },
      { relativePath: "src", recursive: false },
    ]);
    await act(async () => follow.resolve({ results: [
      ...response(["src/current.ts"], true, "src").results,
      ...response(["lib/added.ts"], true, "lib").results,
      ...response(["docs/added.ts"], true, "docs").results,
    ] }));
    expect(hook.result.current.repoFiles).toContain("lib/added.ts");
  });

  it.each(["switch", "root", "relink", "unmount"])("rejects covering and lazy callers on %s without success continuations", async (kind) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const hook = renderHook(useFileTreeOperations); await flush();
    await act(async () => { await hook.result.current.ensurePathLoaded("src"); });
    const active = deferred<Batch>(); const lazy = deferred<{ files: ReturnType<typeof entries> }>();
    mocks.batch.mockReturnValueOnce(active.promise); mocks.lazy.mockReturnValueOnce(lazy.promise);
    const continuation = vi.fn();
    let outcomes!: Promise<PromiseSettledResult<unknown>[]>;
    act(() => {
      const requests = [hook.result.current.loadAllRepoFiles(), hook.result.current.onRefresh(),
        hook.result.current.ensurePathLoaded("src"), hook.result.current.ensurePathLoaded("other")];
      outcomes = Promise.allSettled(requests.map((request) => request.then(continuation)));
      // Also exercise intentional fire-and-forget callers.
      hook.result.current.loadAllRepoFiles(); hook.result.current.ensurePathLoaded("ignored");
    });
    if (kind === "unmount") hook.unmount();
    else {
      if (kind === "switch") mocks.selectedId = "b";
      if (kind === "root") mocks.workspaces[0]!.worktreePath = "/new";
      if (kind === "relink") mocks.workspaces[0]!.nodeId = "other";
      hook.rerender();
    }
    // Cancellation settles callers even while the uncancellable transports remain blocked.
    const settled = await outcomes;
    expect(settled.map((result) => result.status)).toEqual(Array(4).fill("rejected"));
    for (const result of settled) if (result.status === "rejected") {
      expect(result.reason.name).toBe("FileTreeRefreshCancelledError");
    }
    expect(continuation).not.toHaveBeenCalled();
    await act(async () => {
      active.resolve(response(["obsolete.ts"], false)); lazy.resolve({ files: entries(["other/obsolete.ts"]) });
    });
    expect(mocks.batch).toHaveBeenCalledTimes(kind === "unmount" ? 2 : 3);
    expect(errors).not.toHaveBeenCalled();
  });

  it("lets a full root request dominate targeted pending work and resolves loadAll/manual against that request", async () => {
    const hook = renderHook(useFileTreeOperations); await flush();
    const active = deferred<Batch>(); const full = deferred<Batch>();
    mocks.batch.mockReturnValueOnce(active.promise).mockReturnValueOnce(full.promise);
    await change(["src/old.ts"]);
    let all!: Promise<string[]>; let manual!: Promise<void>; let didResolve = false;
    act(() => {
      all = hook.result.current.loadAllRepoFiles();
      manual = hook.result.current.onRefresh();
      all.then(() => { didResolve = true; });
    });
    await change(["lib/new.ts"]);
    expect(mocks.batch).toHaveBeenCalledTimes(2);
    await act(async () => active.resolve(response(["interim.ts"])));
    expect(didResolve).toBe(false);
    expect(mocks.batch.mock.calls[2]?.[0].requests).toEqual([{ relativePath: undefined, recursive: true }]);
    await act(async () => full.resolve(response(["renamed.ts"])));
    expect(await all).toEqual(["renamed.ts"]); await manual;
    expect(hook.result.current.repoFiles).toEqual(["renamed.ts"]);
  });

  it("publishes dirty root results while the merged followup is blocked, without restoring them as fresh cache", async () => {
    const dirty = deferred<Batch>(); const fresh = deferred<Batch>();
    mocks.batch.mockReturnValueOnce(dirty.promise).mockReturnValueOnce(fresh.promise);
    const hook = renderHook(useFileTreeOperations);
    await act(async () => dirty.resolve(response(["interim.ts"], false)));
    expect(hook.result.current.repoFiles).toEqual(["interim.ts"]);
    expect(mocks.batch).toHaveBeenCalledTimes(2);
    expect(mocks.batch.mock.calls[0]?.[0].includeFreshness).toBe(true);
    await act(async () => fresh.resolve(response(["fresh.ts"])));
    expect(hook.result.current.repoFiles).toEqual(["fresh.ts"]);
  });

  it("keeps mixed-directory dirty followups until fresh, including manual caller coverage", async () => {
    const hook = renderHook(useFileTreeOperations); await flush();
    await act(async () => { await hook.result.current.ensurePathLoaded("src"); await hook.result.current.ensurePathLoaded("lib"); });
    const mixed = deferred<Batch>(); const follow = deferred<Batch>();
    mocks.batch.mockReturnValueOnce(mixed.promise).mockReturnValueOnce(follow.promise);
    await change(["src/old.ts", "lib/old.ts"]);
    await act(async () => mixed.resolve({ results: [
      ...response(["src/new.ts"], false, "src").results,
      ...response(["lib/new.ts"], true, "lib").results,
    ] }));
    expect(hook.result.current.repoFiles).toContain("src/new.ts");
    expect(mocks.batch).toHaveBeenCalledTimes(3);
    await act(async () => follow.resolve(response(["src/final.ts"], true, "src")));
    expect(hook.result.current.repoFiles).toContain("src/final.ts");
  });

  it("preserves visible entries after failure, does not retry by itself, and allows explicit retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const hook = renderHook(useFileTreeOperations); await flush();
    const old = hook.result.current.repoFiles;
    mocks.batch.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await expect(hook.result.current.onRefresh()).rejects.toThrow("offline"); });
    expect(hook.result.current.repoFiles).toEqual(old);
    await flush(); expect(mocks.batch).toHaveBeenCalledTimes(2);
    mocks.batch.mockResolvedValueOnce(response(["renamed.ts"]));
    await act(async () => { await hook.result.current.onRefresh(); });
    expect(hook.result.current.repoFiles).toEqual(["renamed.ts"]);
  });

  it("shares lazy completion promises and fences lazy results behind an ordinary root request", async () => {
    const hook = renderHook(useFileTreeOperations); await flush();
    const lazy = deferred<{ files: ReturnType<typeof entries> }>(); const root = deferred<Batch>();
    mocks.lazy.mockReturnValueOnce(lazy.promise);
    let first!: Promise<void>; let second!: Promise<void>; let didResolve = false;
    act(() => {
      first = hook.result.current.ensurePathLoaded("src"); second = hook.result.current.ensurePathLoaded("src");
      second.then(() => { didResolve = true; });
    });
    await flush(); expect(didResolve).toBe(false);
    mocks.batch.mockReturnValueOnce(root.promise);
    await change();
    await act(async () => lazy.resolve({ files: entries(["src/stale.ts"]) }));
    expect(didResolve).toBe(false);
    await act(async () => root.resolve(response(["src/", "src/current.ts"])));
    await first; await second;
    expect(hook.result.current.repoFiles).toEqual(["src/", "src/current.ts"]);
  });

  it("retries fresh lazy descendants after a concurrent shallow ancestor refresh", async () => {
    const snapshots: Array<FileTreeSnapshot | null> = [];
    const runtime = new FileTreeRefreshRuntime({ identity: "lazy-shallow-coverage", workspaceId: "a",
      snapshot: { entries: entries(["src/", "src/deep/", "src/deep/old.ts"]), loadedPaths: ["src"] },
      expandedPaths: [], publish: vi.fn(), cache: (snapshot) => snapshots.push(snapshot) });
    const lazy = deferred<{ files: ReturnType<typeof entries>; isFresh: boolean }>();
    const retry = deferred<{ files: ReturnType<typeof entries>; isFresh: boolean }>();
    const shallow = deferred<Batch>();
    mocks.lazy.mockReturnValueOnce(lazy.promise).mockReturnValueOnce(retry.promise);
    mocks.batch.mockReturnValueOnce(shallow.promise);
    let settled = false;
    const loading = runtime.ensurePathLoaded("src/deep").then(() => { settled = true; });
    const refresh = runtime.refresh(["src/changed.ts"]);
    expect(mocks.batch.mock.calls[0]?.[0].requests).toEqual([{ relativePath: "src", recursive: false }]);
    await act(async () => shallow.resolve(response(["src/deep/", "src/changed.ts"], true, "src")));
    await refresh;
    await act(async () => lazy.resolve({ files: entries(["src/deep/discarded.ts"]), isFresh: true }));
    expect(settled).toBe(false);
    expect(mocks.lazy).toHaveBeenCalledTimes(2);
    expect(snapshots.at(-1)?.loadedPaths).not.toContain("src/deep");
    await act(async () => retry.resolve({ files: entries(["src/deep/current.ts"]), isFresh: true }));
    await loading;
    expect(runtime.entries.map((entry) => entry.path)).toContain("src/deep/current.ts");
    expect(runtime.entries.map((entry) => entry.path)).not.toContain("src/deep/discarded.ts");
    expect.soft(runtime.entries.map((entry) => entry.path)).not.toContain("src/deep/old.ts");
    expect(snapshots.at(-1)?.loadedPaths).toContain("src/deep");
    const restored = new FileTreeRefreshRuntime({ identity: "lazy-shallow-restored", workspaceId: "a",
      snapshot: snapshots.at(-1) ?? undefined, expandedPaths: [], publish: vi.fn(), cache: vi.fn() });
    expect(restored.entries.map((entry) => entry.path)).toContain("src/deep/current.ts");
    expect.soft(restored.entries.map((entry) => entry.path)).not.toContain("src/deep/old.ts");
    restored.dispose();
    const calls = mocks.lazy.mock.calls.length;
    await runtime.ensurePathLoaded("src/deep");
    expect(mocks.lazy).toHaveBeenCalledTimes(calls);
    runtime.dispose();
  });

  it("keeps dirty lazy descendants nonauthoritative until a fresh recursive covering listing", async () => {
    let snapshot: FileTreeSnapshot | null = null;
    const options = { identity: "dirty-lazy-coverage", workspaceId: "a", expandedPaths: [],
      publish: vi.fn(), cache: (next: FileTreeSnapshot | null) => { snapshot = next; } };
    const runtime = new FileTreeRefreshRuntime({ ...options,
      snapshot: { entries: entries(["src/", "src/deep/", "src/deep/old.ts"]), loadedPaths: ["src"] } });
    const fresh = deferred<Batch>();
    mocks.lazy.mockResolvedValueOnce({ files: entries(["src/deep/dirty.ts"]), isFresh: false });
    mocks.batch.mockImplementation(({ requests }: { requests: Array<{ recursive: boolean }> }) =>
      requests[0]?.recursive ? fresh.promise : Promise.resolve(response(["src/deep/"], true, "src")));
    let settled = false;
    const loading = runtime.ensurePathLoaded("src/deep").then(() => { settled = true; });
    await flush();
    expect(runtime.entries.map((entry) => entry.path)).toContain("src/deep/dirty.ts");
    expect(settled).toBe(false);
    expect(mocks.batch.mock.calls[0]?.[0].requests).toEqual([{ relativePath: undefined, recursive: true }]);
    expect(snapshot).toBeNull();
    const interimRestore = new FileTreeRefreshRuntime({ ...options, snapshot: snapshot ?? undefined });
    expect(interimRestore.entries).toEqual([]);
    interimRestore.dispose();
    await act(async () => fresh.resolve(response(["src/", "src/deep/", "src/deep/current.ts"])));
    await loading;
    expect(settled).toBe(true);
    const restored = new FileTreeRefreshRuntime({ ...options, snapshot: snapshot ?? undefined });
    expect(restored.entries.map((entry) => entry.path)).toEqual(["src/", "src/deep/", "src/deep/current.ts"]);
    const calls = mocks.lazy.mock.calls.length;
    await runtime.ensurePathLoaded("src/deep");
    expect(mocks.lazy).toHaveBeenCalledTimes(calls);
    runtime.dispose(); restored.dispose();
  });

  it.each(["switch", "root", "relink", "unmount"])("rejects old lifecycle writes and obsolete pending after %s", async (kind) => {
    const old = deferred<Batch>(); const current = deferred<Batch>();
    mocks.batch.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const hook = renderHook(useFileTreeOperations);
    await change(["obsolete.ts"]);
    expect(mocks.batch).toHaveBeenCalledTimes(1);
    if (kind === "unmount") { hook.unmount(); }
    else {
      if (kind === "switch") mocks.selectedId = "b";
      if (kind === "root") mocks.workspaces[0]!.worktreePath = "/new";
      if (kind === "relink") mocks.workspaces[0]!.nodeId = "other";
      hook.rerender();
    }
    const remounted = kind === "unmount" ? renderHook(useFileTreeOperations) : hook;
    await flush();
    await act(async () => current.resolve(response(["current.ts"])));
    await act(async () => old.resolve(response(["obsolete.ts"], false)));
    expect(remounted.result.current.repoFiles).toEqual(["current.ts"]);
    expect(mocks.batch).toHaveBeenCalledTimes(2);
  });

  it("does not restore dirty cache after switching away and back, or accept an old same-identity request", async () => {
    const dirty = deferred<Batch>(); const old = deferred<Batch>(); const back = deferred<Batch>();
    mocks.batch.mockReturnValueOnce(dirty.promise).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(response(["b.ts"])).mockReturnValueOnce(back.promise);
    const hook = renderHook(useFileTreeOperations);
    await act(async () => dirty.resolve(response(["dirty.ts"], false)));
    mocks.selectedId = "b"; hook.rerender(); await flush();
    mocks.create.mockReset().mockResolvedValue(undefined); mocks.rename.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockReset().mockResolvedValue(undefined); mocks.open.mockReset();
    mocks.selectedId = "a"; hook.rerender(); await flush();
    expect(hook.result.current.repoFiles).toEqual([]);
    await act(async () => old.resolve(response(["old.ts"])));
    expect(hook.result.current.repoFiles).toEqual([]);
    await act(async () => back.resolve(response(["back.ts"])));
    expect(hook.result.current.repoFiles).toEqual(["back.ts"]);
  });
  it("evicts renamed/deleted subtrees, including unexpanded descendants and dirty interim names", async () => {
    mocks.batch.mockResolvedValueOnce(response(["src/", "src/deleted/", "src/deleted/deep.ts", "src/old.ts"]));
    const hook = renderHook(useFileTreeOperations); await flush();
    await act(async () => { await hook.result.current.ensurePathLoaded("src"); });
    const dirty = deferred<Batch>(); const fresh = deferred<Batch>();
    mocks.batch.mockReturnValueOnce(dirty.promise).mockReturnValueOnce(fresh.promise);
    await change(["src/old.ts", "src/deleted"]);
    await act(async () => dirty.resolve(response(["src/interim.ts"], false, "src")));
    expect(hook.result.current.repoFiles).not.toContain("src/deleted/deep.ts");
    await act(async () => fresh.resolve(response(["src/renamed.ts"], true, "src")));
    expect(hook.result.current.repoFiles).toEqual(["src/", "src/renamed.ts"]);
  });

  it("waits for covering ordinary work even when the directory was previously loaded", async () => {
    const hook = renderHook(useFileTreeOperations); await flush();
    await act(async () => { await hook.result.current.ensurePathLoaded("src"); });
    const active = deferred<Batch>(); mocks.batch.mockReturnValueOnce(active.promise);
    await change();
    let didResolve = false; let ensure!: Promise<void>;
    act(() => { ensure = hook.result.current.ensurePathLoaded("src"); ensure.then(() => { didResolve = true; }); });
    await flush(); expect(didResolve).toBe(false);
    await act(async () => active.resolve(response(["src/", "src/current.ts"])));
    await ensure; expect(didResolve).toBe(true);
  });

  it("publishes successive dirty completions without settling a manual caller until fresh", async () => {
    const hook = renderHook(useFileTreeOperations); await flush();
    const first = deferred<Batch>(); const second = deferred<Batch>(); const final = deferred<Batch>();
    mocks.batch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(final.promise);
    let all!: Promise<string[]>; let didResolve = false;
    act(() => { all = hook.result.current.loadAllRepoFiles(); all.then(() => { didResolve = true; }); });
    for (let i = 0; i < 3; i++) await change([`arrival-${i}.ts`]);
    await act(async () => first.resolve(response(["first.ts"], false)));
    expect(hook.result.current.repoFiles).toEqual(["first.ts"]); expect(didResolve).toBe(false);
    await change(["later.ts"]);
    await act(async () => second.resolve(response(["second.ts"], false)));
    expect(hook.result.current.repoFiles).toEqual(["second.ts"]); expect(didResolve).toBe(false);
    await act(async () => final.resolve(response(["final.ts"])));
    expect(await all).toEqual(["final.ts"]);
    expect(mocks.batch).toHaveBeenCalledTimes(4);
  });

  it("passes opt-in through the actual commands adapter and preserves mixed per-directory freshness", async () => {
    const daemon = await import("../../../daemon/daemonFileClient");
    const commands = await vi.importActual<typeof import("../../../commands/fileCommands")>("../../../commands/fileCommands");
    const invoke = vi.fn(async (_method: string, params: unknown) => {
      const request = params as { path: string; includeFreshness?: boolean };
      return request.includeFreshness ? { files: entries([request.path || "root.ts"]), isFresh: request.path !== "" }
        : entries(["legacy.ts"]);
    });
    vi.spyOn(daemon, "getFileRpc").mockResolvedValue(new daemon.DaemonFileClient(invoke));
    const snapshots = await commands.listFilesBatch({ workspaceId: "a", includeFreshness: true,
      requests: [{ recursive: true }, { relativePath: "src", recursive: false }] });
    expect(snapshots.results.map((listing) => listing.isFresh)).toEqual([false, true]);
    expect(invoke).toHaveBeenCalledWith("file.list", { workspaceId: "a", path: "src", recursive: false, includeFreshness: true });
    const legacy = await commands.listFilesBatch({ workspaceId: "a", requests: [{ recursive: true }] });
    expect(legacy.results[0]?.files[0]?.path).toBe("legacy.ts");
    expect(legacy.results[0]?.isFresh).toBeUndefined();
  });

});
