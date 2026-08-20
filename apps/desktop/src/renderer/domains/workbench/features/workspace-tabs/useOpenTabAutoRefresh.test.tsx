// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type RefreshableOpenTab, useOpenTabAutoRefresh } from "./useOpenTabAutoRefresh";

type DaemonConnectionStatus = "connected" | "connecting" | "disconnected";

type BackendEvent =
  | {
      source: "workspaceFilesChanged";
      payload: { workspaceId?: string; workspaceWorktreePath: string; changedRelativePaths?: string[] };
    }
  | {
      source: "gitChanged";
      payload: { workspaceId?: string; workspaceWorktreePath: string };
    };

type BackendEventName = "workspace.files.changed" | "git.changed";
type BackendEventListener = (event: BackendEvent) => void;

const mocked = vi.hoisted(() => ({
  listenersByName: new Map<BackendEventName, Set<BackendEventListener>>(),
  startBackendEventPipeline: vi.fn(() => mocked.stopBackendEventPipeline),
  stopBackendEventPipeline: vi.fn(),
  subscribeBackendEvent: vi.fn((name: BackendEventName, listener: BackendEventListener) => {
    const listeners = mocked.listenersByName.get(name) ?? new Set<BackendEventListener>();
    listeners.add(listener);
    mocked.listenersByName.set(name, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        mocked.listenersByName.delete(name);
      }
    };
  }),
}));

vi.mock("../../../../events", () => ({
  startBackendEventPipeline: mocked.startBackendEventPipeline,
  subscribeBackendEvent: mocked.subscribeBackendEvent,
}));

function emitBackendEvent(name: BackendEventName, event: BackendEvent) {
  for (const listener of mocked.listenersByName.get(name) ?? []) {
    listener(event);
  }
}

function createCommands() {
  return {
    readFile: vi.fn(async ({ relativePath }: { relativePath: string }) => ({ content: `content:${relativePath}` })),
    readDiff: vi.fn(async ({ relativePath }: { relativePath: string }) => ({
      oldContent: `old:${relativePath}`,
      newContent: `new:${relativePath}`,
    })),
    readCommitDiff: vi.fn(async ({ relativePath }: { relativePath: string }) => ({
      oldContent: `commit-old:${relativePath}`,
      newContent: `commit-new:${relativePath}`,
    })),
    readBranchComparisonDiff: vi.fn(async ({ relativePath }: { relativePath: string }) => ({
      oldContent: `branch-old:${relativePath}`,
      newContent: `branch-new:${relativePath}`,
    })),
    refreshFileTabFromDisk: vi.fn(),
    refreshDiffTabContent: vi.fn(),
  };
}

async function flushRefreshWork() {
  await vi.runAllTimersAsync();
}

function createDaemonStatusHarness() {
  const state: { listener: ((status: DaemonConnectionStatus) => void) | null } = { listener: null };
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((listener: (status: DaemonConnectionStatus) => void) => {
    state.listener = listener;
    return unsubscribe;
  });

  return {
    subscribe,
    unsubscribe,
    emit(status: DaemonConnectionStatus) {
      state.listener?.(status);
    },
  };
}

describe("useOpenTabAutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    mocked.listenersByName.clear();
    vi.clearAllMocks();
  });

  it("refreshes only matching clean file tabs when workspace files change", async () => {
    const commands = createCommands();
    const tabs: RefreshableOpenTab[] = [
      { id: "file-1", kind: "file", path: "src/changed.ts" },
      { id: "file-2", kind: "file", path: "src/other.ts" },
      { id: "file-3", kind: "file", path: "src/dirty.ts" },
    ];

    renderHook(() =>
      useOpenTabAutoRefresh({
        workspaceId: "workspace-1",
        tabs,
        commands: commands,
      }),
    )

    // Flush the mount-time eager refresh (first call loads existing tabs),
    // then clear so the event assertions below measure only the event path.
    await flushRefreshWork();
    commands.readFile.mockClear();
    commands.readDiff.mockClear();
    commands.refreshFileTabFromDisk.mockClear();
    commands.refreshDiffTabContent.mockClear();;

    emitBackendEvent("workspace.files.changed", {
      source: "workspaceFilesChanged",
      payload: {
        workspaceId: "workspace-1",
        workspaceWorktreePath: "/repo",
        changedRelativePaths: ["src/changed.ts", "src/dirty.ts"],
      },
    });
    await flushRefreshWork();

    // Dirty/clean gating lives inside refreshFileTabFromDisk (Files store);
    // the runtime refreshes every file tab whose path changed.
    expect(commands.readFile).toHaveBeenCalledTimes(2);
    expect(commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/changed.ts" });
    expect(commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/dirty.ts" });
    expect(commands.refreshFileTabFromDisk).toHaveBeenCalledWith({
      tabId: "file-1",
      content: "content:src/changed.ts",
      deleted: false,
    });
  });

  it("ignores file changes from other workspaces", async () => {
    const commands = createCommands();
    const tabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/changed.ts" }];

    renderHook(() =>
      useOpenTabAutoRefresh({
        workspaceId: "workspace-1",
        tabs,
        commands: commands,
      }),
    )

    // Flush the mount-time eager refresh (first call loads existing tabs),
    // then clear so the event assertions below measure only the event path.
    await flushRefreshWork();
    commands.readFile.mockClear();
    commands.readDiff.mockClear();
    commands.refreshFileTabFromDisk.mockClear();
    commands.refreshDiffTabContent.mockClear();;

    emitBackendEvent("workspace.files.changed", {
      source: "workspaceFilesChanged",
      payload: { workspaceId: "other", workspaceWorktreePath: "/other", changedRelativePaths: ["src/changed.ts"] },
    });
    await flushRefreshWork();

    expect(commands.readFile).not.toHaveBeenCalled();
  });

  it("refreshes diff tabs when git changes", async () => {
    const commands = createCommands();
    const tabs: RefreshableOpenTab[] = [
      { id: "file-1", kind: "file", path: "src/changed.ts" },
      { id: "diff-1", kind: "diff", path: "src/changed.ts" },
      { id: "diff-2", kind: "diff", path: "src/branch.ts", source: { kind: "branch", targetBranch: "main" } },
    ];

    renderHook(() =>
      useOpenTabAutoRefresh({
        workspaceId: "workspace-1",
        tabs,
        commands: commands,
      }),
    )

    // Flush the mount-time eager refresh (first call loads existing tabs),
    // then clear so the event assertions below measure only the event path.
    await flushRefreshWork();
    commands.readFile.mockClear();
    commands.readDiff.mockClear();
    commands.refreshFileTabFromDisk.mockClear();
    commands.refreshDiffTabContent.mockClear();;

    emitBackendEvent("git.changed", {
      source: "gitChanged",
      payload: { workspaceId: "workspace-1", workspaceWorktreePath: "/repo" },
    });
    await flushRefreshWork();

    expect(commands.readFile).toHaveBeenCalledTimes(1);
    expect(commands.readDiff).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/changed.ts" });
    expect(commands.readBranchComparisonDiff).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      targetBranch: "main",
      relativePath: "src/branch.ts",
    });
    expect(commands.refreshDiffTabContent).toHaveBeenCalledTimes(2);
  });

  it("unsubscribes event listeners on unmount", () => {
    const commands = createCommands();
    const tabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/changed.ts" }];

    const { unmount } = renderHook(() =>
      useOpenTabAutoRefresh({
        workspaceId: "workspace-1",
        tabs,
        commands: commands,
      }),
    );

    expect(mocked.listenersByName.get("workspace.files.changed")?.size).toBe(1);
    expect(mocked.listenersByName.get("git.changed")?.size).toBe(1);
    expect(mocked.startBackendEventPipeline).toHaveBeenCalledTimes(1);

    unmount();

    expect(mocked.listenersByName.size).toBe(0);
    expect(mocked.stopBackendEventPipeline).toHaveBeenCalledTimes(1);
  });

  describe("daemon reconnect refresh", () => {
    it("re-reads all clean file tabs when daemon reconnects after disconnect", async () => {
      const commands = createCommands();
      const tabs: RefreshableOpenTab[] = [
        { id: "file-1", kind: "file", path: "src/a.ts" },
        { id: "file-2", kind: "file", path: "src/b.ts" },
        { id: "diff-1", kind: "diff", path: "src/c.ts" },
      ];

      const daemonHarness = createDaemonStatusHarness();

      renderHook(() =>
        useOpenTabAutoRefresh({
          workspaceId: "workspace-1",
          tabs,
          commands,
          subscribeDaemonConnectionStatus: daemonHarness.subscribe,
        }),
      );

      expect(daemonHarness.subscribe).toHaveBeenCalledOnce();

      // Simulate daemon disconnect then reconnect.
      daemonHarness.emit("disconnected");
      daemonHarness.emit("connected");
      await flushRefreshWork();

      // Every open file tab is re-read on reconnect (dirty gating in Files store).
      expect(commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/a.ts" });
      expect(commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/b.ts" });
      // Diff tab should also be refreshed.
      expect(commands.readDiff).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/c.ts" });
    });

    it("does not refresh when connected fires without prior disconnect", async () => {
      const commands = createCommands();
      const tabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts" }];

      const daemonHarness = createDaemonStatusHarness();

      renderHook(() =>
        useOpenTabAutoRefresh({
          workspaceId: "workspace-1",
          tabs,
          commands,
          subscribeDaemonConnectionStatus: daemonHarness.subscribe,
        }),
      )

    // Flush the mount-time eager refresh (first call loads existing tabs),
    // then clear so the event assertions below measure only the event path.
    await flushRefreshWork();
    commands.readFile.mockClear();
    commands.readDiff.mockClear();
    commands.refreshFileTabFromDisk.mockClear();
    commands.refreshDiffTabContent.mockClear();;

      // Fire "connected" without any prior "disconnected".
      daemonHarness.emit("connected");
      await flushRefreshWork();

      expect(commands.readFile).not.toHaveBeenCalled();
    });

    it("does not refresh on second connected if no new disconnect occurred", async () => {
      const commands = createCommands();
      const tabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts" }];

      const daemonHarness = createDaemonStatusHarness();

      renderHook(() =>
        useOpenTabAutoRefresh({
          workspaceId: "workspace-1",
          tabs,
          commands,
          subscribeDaemonConnectionStatus: daemonHarness.subscribe,
        }),
      )

    // Flush the mount-time eager refresh (first call loads existing tabs),
    // then clear so the event assertions below measure only the event path.
    await flushRefreshWork();
    commands.readFile.mockClear();
    commands.readDiff.mockClear();
    commands.refreshFileTabFromDisk.mockClear();
    commands.refreshDiffTabContent.mockClear();;

      // First reconnect.
      daemonHarness.emit("disconnected");
      daemonHarness.emit("connected");
      await flushRefreshWork();

      expect(commands.readFile).toHaveBeenCalledTimes(1);

      // Second "connected" without a new "disconnected" in between.
      daemonHarness.emit("connected");
      await flushRefreshWork();

      // Should NOT trigger a second refresh.
      expect(commands.readFile).toHaveBeenCalledTimes(1);
    });

    it("unsubscribes daemon connection status listener on unmount", () => {
      const commands = createCommands();
      const tabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts" }];
      const daemonHarness = createDaemonStatusHarness();

      const { unmount } = renderHook(() =>
        useOpenTabAutoRefresh({
          workspaceId: "workspace-1",
          tabs,
          commands,
          subscribeDaemonConnectionStatus: daemonHarness.subscribe,
        }),
      );

      unmount();

      expect(daemonHarness.unsubscribe).toHaveBeenCalledOnce();
    });
  });

  describe("eager refresh for newly-opened tabs", () => {
    it("refreshes tabs added after initial mount", async () => {
      const commands = createCommands();
      const initialTabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts" }];

      const { rerender } = renderHook(
        ({ tabs }) =>
          useOpenTabAutoRefresh({
            workspaceId: "workspace-1",
            tabs,
            commands,
          }),
        { initialProps: { tabs: initialTabs } },
      );

      // Initial mount loads existing tabs' content (no seen history yet).
      await flushRefreshWork();
      expect(commands.readFile).toHaveBeenCalledTimes(1);
      expect(commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/a.ts" });

      // Add a new tab.
      const updatedTabs: RefreshableOpenTab[] = [...initialTabs, { id: "file-2", kind: "file", path: "src/b.ts" }];
      rerender({ tabs: updatedTabs });
      await flushRefreshWork();

      // Only the new tab should be refreshed (the first tab is now seen).
      expect(commands.readFile).toHaveBeenCalledTimes(2);
      expect(commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/b.ts" });
      expect(commands.refreshFileTabFromDisk).toHaveBeenCalledWith({
        tabId: "file-2",
        content: "content:src/b.ts",
        deleted: false,
      });
    });

    it("refreshes new diff tabs added after initial mount", async () => {
      const commands = createCommands();
      const initialTabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts" }];

      const { rerender } = renderHook(
        ({ tabs }) =>
          useOpenTabAutoRefresh({
            workspaceId: "workspace-1",
            tabs,
            commands,
          }),
        { initialProps: { tabs: initialTabs } },
      )

    // Flush the mount-time eager refresh (first call loads existing tabs),
    // then clear so the event assertions below measure only the event path.
    await flushRefreshWork();
    commands.readFile.mockClear();
    commands.readDiff.mockClear();
    commands.refreshFileTabFromDisk.mockClear();
    commands.refreshDiffTabContent.mockClear();;

      await flushRefreshWork();
      expect(commands.readFile).not.toHaveBeenCalled();

      // Add a new diff tab.
      const updatedTabs: RefreshableOpenTab[] = [
        ...initialTabs,
        { id: "diff-1", kind: "diff", path: "src/changed.ts" },
      ];
      rerender({ tabs: updatedTabs });
      await flushRefreshWork();

      expect(commands.readDiff).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/changed.ts" });
      expect(commands.refreshDiffTabContent).toHaveBeenCalledWith({
        tabId: "diff-1",
        oldContent: "old:src/changed.ts",
        newContent: "new:src/changed.ts",
      });
    });

    it("eagerly refreshes newly added file tabs", async () => {
      const commands = createCommands();
      const initialTabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts" }];

      const { rerender } = renderHook(
        ({ tabs }) =>
          useOpenTabAutoRefresh({
            workspaceId: "workspace-1",
            tabs,
            commands,
          }),
        { initialProps: { tabs: initialTabs } },
      );

      await flushRefreshWork();

      // Add a new tab — eager refresh reads it (dirty gating lives in Files store).
      const updatedTabs: RefreshableOpenTab[] = [...initialTabs, { id: "file-2", kind: "file", path: "src/b.ts" }];
      rerender({ tabs: updatedTabs });
      await flushRefreshWork();

      expect(commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/b.ts" });
    });

    it("marks newly-opened tabs deleted when the file does not exist", async () => {
      const commands = createCommands();
      commands.readFile.mockRejectedValue(new Error("open src/b.ts: no such file or directory"));
      const initialTabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts" }];

      const { rerender } = renderHook(
        ({ tabs }) =>
          useOpenTabAutoRefresh({
            workspaceId: "workspace-1",
            tabs,
            commands,
          }),
        { initialProps: { tabs: initialTabs } },
      )

    // Flush the mount-time eager refresh (first call loads existing tabs),
    // then clear so the event assertions below measure only the event path.
    await flushRefreshWork();
    commands.readFile.mockClear();
    commands.readDiff.mockClear();
    commands.refreshFileTabFromDisk.mockClear();
    commands.refreshDiffTabContent.mockClear();;

      await flushRefreshWork();
      expect(commands.readFile).not.toHaveBeenCalled();

      // Add a new tab pointing at a non-existent file (e.g. an agent-provided path).
      const updatedTabs: RefreshableOpenTab[] = [...initialTabs, { id: "file-2", kind: "file", path: "src/b.ts" }];
      rerender({ tabs: updatedTabs });
      await flushRefreshWork();

      // The tab is marked deleted instead of showing mock placeholder content.
      expect(commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/b.ts" });
      expect(commands.refreshFileTabFromDisk).toHaveBeenCalledWith({
        tabId: "file-2",
        content: "",
        deleted: true,
      });
    });

    it("leaves non-not-found read failures to the event-driven refresh", async () => {
      const commands = createCommands();
      commands.readFile.mockRejectedValue(new Error("connection closed"));
      const initialTabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts" }];

      const { rerender } = renderHook(
        ({ tabs }) =>
          useOpenTabAutoRefresh({
            workspaceId: "workspace-1",
            tabs,
            commands,
          }),
        { initialProps: { tabs: initialTabs } },
      )

    // Flush the mount-time eager refresh (first call loads existing tabs),
    // then clear so the event assertions below measure only the event path.
    await flushRefreshWork();
    commands.readFile.mockClear();
    commands.readDiff.mockClear();
    commands.refreshFileTabFromDisk.mockClear();
    commands.refreshDiffTabContent.mockClear();;

      await flushRefreshWork();

      const updatedTabs: RefreshableOpenTab[] = [...initialTabs, { id: "file-2", kind: "file", path: "src/b.ts" }];
      rerender({ tabs: updatedTabs });
      await flushRefreshWork();

      expect(commands.refreshFileTabFromDisk).not.toHaveBeenCalled();
    });
  });
});
