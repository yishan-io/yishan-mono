// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenTabAutoRefresh, type RefreshableOpenTab } from "./useOpenTabAutoRefresh";

type BackendEvent =
  | {
      source: "workspaceFilesChanged";
      payload: { workspaceWorktreePath: string; changedRelativePaths?: string[] };
    }
  | {
      source: "gitChanged";
      payload: { workspaceWorktreePath: string };
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
        workspaceWorktreePath: "/repo",
        tabs,
        commands: commands,
      }),
    );

    emitBackendEvent("workspace.files.changed", {
      source: "workspaceFilesChanged",
      payload: { workspaceWorktreePath: "/repo", changedRelativePaths: ["src/changed.ts", "src/dirty.ts"] },
    });
    await flushRefreshWork();

    expect(commands.readFile).toHaveBeenCalledTimes(1);
    expect(commands.readFile).toHaveBeenCalledWith({ workspaceWorktreePath: "/repo", relativePath: "src/changed.ts" });
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
        workspaceWorktreePath: "/repo",
        tabs,
        commands: commands,
      }),
    );

    emitBackendEvent("workspace.files.changed", {
      source: "workspaceFilesChanged",
      payload: { workspaceWorktreePath: "/other", changedRelativePaths: ["src/changed.ts"] },
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
        workspaceWorktreePath: "/repo",
        tabs,
        commands: commands,
      }),
    );

    emitBackendEvent("git.changed", {
      source: "gitChanged",
      payload: { workspaceWorktreePath: "/repo" },
    });
    await flushRefreshWork();

    expect(commands.readFile).toHaveBeenCalledTimes(1);
    expect(commands.readDiff).toHaveBeenCalledWith({ workspaceWorktreePath: "/repo", relativePath: "src/changed.ts" });
    expect(commands.readBranchComparisonDiff).toHaveBeenCalledWith({
      workspaceWorktreePath: "/repo",
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
        workspaceWorktreePath: "/repo",
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
});
