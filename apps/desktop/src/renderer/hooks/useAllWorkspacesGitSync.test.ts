import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFRESH_THROTTLE_MS, scheduleWorkspaceRefresh } from "./useAllWorkspacesGitSync";

type WorkspaceRefreshState = {
  inFlight: boolean;
  queued: boolean;
  lastFinishedAt: number;
  pendingTimer: ReturnType<typeof setTimeout> | null;
};

describe("scheduleWorkspaceRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls refresh immediately when no prior state exists", async () => {
    const stateMap = new Map<string, WorkspaceRefreshState>();
    const doRefresh = vi.fn(async () => {});

    await scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);

    expect(doRefresh).toHaveBeenCalledWith("workspace-1", "/tmp/ws1");
    expect(doRefresh).toHaveBeenCalledTimes(1);
  });

  it("queues at most one refresh when a call is already in-flight", async () => {
    const stateMap = new Map<string, WorkspaceRefreshState>();
    let resolveRefresh!: () => void;
    const doRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = () => resolve();
        }),
    );

    // Start first refresh (will block)
    const firstCall = scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);

    // Fire two more while in-flight - both should be coalesced into one queued refresh
    void scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);
    void scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);

    expect(doRefresh).toHaveBeenCalledTimes(1);

    // Complete the first call
    resolveRefresh();
    await firstCall;

    // The queued refresh should be scheduled immediately (no throttle since lastFinishedAt just changed)
    // Wait for the queued call to start
    await vi.runAllTimersAsync();

    expect(doRefresh).toHaveBeenCalledTimes(2);
  });

  it("throttles rapid consecutive calls respecting REFRESH_THROTTLE_MS", async () => {
    const stateMap = new Map<string, WorkspaceRefreshState>();
    const doRefresh = vi.fn(async () => {});

    // First call executes immediately
    await scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);
    expect(doRefresh).toHaveBeenCalledTimes(1);

    // Second call within throttle window should be deferred
    void scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);
    expect(doRefresh).toHaveBeenCalledTimes(1);

    // Advance past the throttle window
    vi.advanceTimersByTime(REFRESH_THROTTLE_MS);
    await vi.runAllTimersAsync();

    expect(doRefresh).toHaveBeenCalledTimes(2);
  });

  it("handles different workspaces independently", async () => {
    const stateMap = new Map<string, WorkspaceRefreshState>();
    const doRefresh = vi.fn(async () => {});

    await scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);
    await scheduleWorkspaceRefresh("workspace-2", "/tmp/ws2", stateMap, doRefresh);

    expect(doRefresh).toHaveBeenCalledTimes(2);
    expect(doRefresh).toHaveBeenCalledWith("workspace-1", "/tmp/ws1");
    expect(doRefresh).toHaveBeenCalledWith("workspace-2", "/tmp/ws2");
  });

  it("does not duplicate timers when multiple schedule calls arrive during throttle window", async () => {
    const stateMap = new Map<string, WorkspaceRefreshState>();
    const doRefresh = vi.fn(async () => {});

    // First call executes immediately
    await scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);
    expect(doRefresh).toHaveBeenCalledTimes(1);

    // Multiple calls during throttle window should only create one timer
    void scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);
    void scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);
    void scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);

    // Still only the initial call completed
    expect(doRefresh).toHaveBeenCalledTimes(1);

    // Advance past throttle - should trigger exactly one additional call
    vi.advanceTimersByTime(REFRESH_THROTTLE_MS);
    await vi.runAllTimersAsync();

    expect(doRefresh).toHaveBeenCalledTimes(2);
  });

  it("resumes normal operation after throttle window passes", async () => {
    const stateMap = new Map<string, WorkspaceRefreshState>();
    const doRefresh = vi.fn(async () => {});

    await scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);
    expect(doRefresh).toHaveBeenCalledTimes(1);

    // Wait past the throttle window
    vi.advanceTimersByTime(REFRESH_THROTTLE_MS + 1);

    // Next call should execute immediately
    await scheduleWorkspaceRefresh("workspace-1", "/tmp/ws1", stateMap, doRefresh);
    expect(doRefresh).toHaveBeenCalledTimes(2);
  });
});
