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

vi.mock("../events/backendEventPipeline", () => ({
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
      { id: "file-1", kind: "file", path: "src/changed.ts", isDirty: false },
      { id: "file-2", kind: "file", path: "src/other.ts", isDirty: false },
      { id: "file-3", kind: "file", path: "src/dirty.ts", isDirty: true },
    ];

    renderHook(() =>
      useOpenTabAutoRefresh({
        workspaceId: "workspace-1",
        tabs,
        commands: commands,
      }),
    );

    emitBackendEvent("workspace.files.changed", {
      source: "workspaceFilesChanged",
      payload: {
        workspaceId: "workspace-1",
        workspaceWorktreePath: "/repo",
        changedRelativePaths: ["src/changed.ts", "src/dirty.ts"],
      },
    });
    await flushRefreshWork();

    expect(commands.readFile).toHaveBeenCalledTimes(1);
    expect(commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/changed.ts" });
    expect(commands.refreshFileTabFromDisk).toHaveBeenCalledWith({
      tabId: "file-1",
      content: "content:src/changed.ts",
      deleted: false,
    });
  });

  it("ignores file changes from other workspaces", async () => {
    const commands = createCommands();
    const tabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/changed.ts", isDirty: false }];

    renderHook(() =>
      useOpenTabAutoRefresh({
        workspaceId: "workspace-1",
        tabs,
        commands: commands,
      }),
    );

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
      { id: "file-1", kind: "file", path: "src/changed.ts", isDirty: false },
      { id: "diff-1", kind: "diff", path: "src/changed.ts" },
      { id: "diff-2", kind: "diff", path: "src/branch.ts", source: { kind: "branch", targetBranch: "main" } },
    ];

    renderHook(() =>
      useOpenTabAutoRefresh({
        workspaceId: "workspace-1",
        tabs,
        commands: commands,
      }),
    );

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
    const tabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/changed.ts", isDirty: false }];

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
        { id: "file-1", kind: "file", path: "src/a.ts", isDirty: false },
        { id: "file-2", kind: "file", path: "src/b.ts", isDirty: true },
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

      // Clean file tab should be re-read.
      expect(commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/a.ts" });
      // Dirty file tab should not be re-read.
      expect(commands.readFile).not.toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/b.ts" });
      // Diff tab should also be refreshed.
      expect(commands.readDiff).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/c.ts" });
    });

    it("does not refresh when connected fires without prior disconnect", async () => {
      const commands = createCommands();
      const tabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts", isDirty: false }];

      const daemonHarness = createDaemonStatusHarness();

      renderHook(() =>
        useOpenTabAutoRefresh({
          workspaceId: "workspace-1",
          tabs,
          commands,
          subscribeDaemonConnectionStatus: daemonHarness.subscribe,
        }),
      );

      // Fire "connected" without any prior "disconnected".
      daemonHarness.emit("connected");
      await flushRefreshWork();

      expect(commands.readFile).not.toHaveBeenCalled();
    });

    it("does not refresh on second connected if no new disconnect occurred", async () => {
      const commands = createCommands();
      const tabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts", isDirty: false }];

      const daemonHarness = createDaemonStatusHarness();

      renderHook(() =>
        useOpenTabAutoRefresh({
          workspaceId: "workspace-1",
          tabs,
          commands,
          subscribeDaemonConnectionStatus: daemonHarness.subscribe,
        }),
      );

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
      const tabs: RefreshableOpenTab[] = [{ id: "file-1", kind: "file", path: "src/a.ts", isDirty: false }];
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
});
