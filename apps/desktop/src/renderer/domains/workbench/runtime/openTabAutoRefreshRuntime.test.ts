// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type OpenTabAutoRefreshCommands,
  type OpenTabAutoRefreshContext,
  type RefreshableOpenTab,
  createOpenTabAutoRefreshRuntime,
} from "./openTabAutoRefreshRuntime";

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

vi.mock("../../../events", () => ({
  startBackendEventPipeline: mocked.startBackendEventPipeline,
  subscribeBackendEvent: mocked.subscribeBackendEvent,
}));

function emitBackendEvent(name: BackendEventName, event: BackendEvent) {
  for (const listener of mocked.listenersByName.get(name) ?? []) {
    listener(event);
  }
}

function createCommands(): OpenTabAutoRefreshCommands {
  return {
    readFile: vi.fn(async () => ({ content: "content" })),
    readDiff: vi.fn(async () => ({ oldContent: "old", newContent: "new" })),
    readCommitDiff: vi.fn(async () => ({ oldContent: "commit-old", newContent: "commit-new" })),
    readBranchComparisonDiff: vi.fn(async () => ({ oldContent: "branch-old", newContent: "branch-new" })),
    refreshFileTabFromDisk: vi.fn(),
    refreshDiffTabContent: vi.fn(),
  } as unknown as OpenTabAutoRefreshCommands;
}

const TAB: RefreshableOpenTab = { id: "file-1", kind: "file", path: "src/a.ts" };

function createContext(overrides?: Partial<OpenTabAutoRefreshContext>): OpenTabAutoRefreshContext {
  return { workspaceId: "workspace-1", tabs: [TAB], commands: createCommands(), ...overrides };
}

describe("openTabAutoRefreshRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    mocked.listenersByName.clear();
    vi.clearAllMocks();
  });

  it("coalesces overlapping refresh requests into one queued re-run", async () => {
    const runtime = createOpenTabAutoRefreshRuntime();
    const context = createContext();
    let releaseFirstRead: (() => void) | undefined;
    (context.commands.readFile as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirstRead = () => {
            resolve({ content: "content" });
          };
        }),
    );

    const stop = runtime.start({ workspaceId: "workspace-1", getContext: () => context });
    emitBackendEvent("workspace.files.changed", {
      source: "workspaceFilesChanged",
      payload: { workspaceId: "workspace-1", workspaceWorktreePath: "/repo", changedRelativePaths: ["src/a.ts"] },
    });

    // First refresh is in-flight (readFile pending).
    await vi.advanceTimersByTimeAsync(0);
    expect(context.commands.readFile).toHaveBeenCalledTimes(1);

    // Two more events arrive while in-flight — they must coalesce into ONE queued re-run.
    emitBackendEvent("workspace.files.changed", {
      source: "workspaceFilesChanged",
      payload: { workspaceId: "workspace-1", workspaceWorktreePath: "/repo", changedRelativePaths: ["src/b.ts"] },
    });
    emitBackendEvent("workspace.files.changed", {
      source: "workspaceFilesChanged",
      payload: { workspaceId: "workspace-1", workspaceWorktreePath: "/repo", changedRelativePaths: ["src/c.ts"] },
    });

    // Release the in-flight refresh; the queued re-run fires exactly once.
    releaseFirstRead?.();
    await vi.runAllTimersAsync();

    expect(context.commands.readFile).toHaveBeenCalledTimes(2);
    stop();
  });

  it("subscribes to backend events and cleans up on stop", () => {
    const runtime = createOpenTabAutoRefreshRuntime();
    const stop = runtime.start({ workspaceId: "workspace-1", getContext: () => createContext() });

    expect(mocked.listenersByName.get("workspace.files.changed")?.size).toBe(1);
    expect(mocked.listenersByName.get("git.changed")?.size).toBe(1);

    stop();

    expect(mocked.listenersByName.size).toBe(0);
  });

  it("eagerly refreshes only newly-opened tabs", async () => {
    const runtime = createOpenTabAutoRefreshRuntime();
    const context = createContext();

    // Initial mount: seeds the seen set without refreshing.
    runtime.refreshNewTabs(() => context);
    expect(context.commands.readFile).not.toHaveBeenCalled();

    // A new tab is added — only it gets refreshed.
    const newTab: RefreshableOpenTab = { id: "file-2", kind: "file", path: "src/b.ts" };
    context.tabs = [TAB, newTab];
    runtime.refreshNewTabs(() => context);
    await vi.runAllTimersAsync();

    expect(context.commands.readFile).toHaveBeenCalledTimes(1);
    expect(context.commands.readFile).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "src/b.ts" });
  });
});
