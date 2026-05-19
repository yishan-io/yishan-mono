import { describe, expect, it, vi } from "vitest";
import type { RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
import { createBackendEventStoreBindings } from "./backendEventStoreBindings";

/**
 * Creates one in-memory git.changed subscription harness.
 */
function createGitChangedHarness() {
  let listener: ((workspaceWorktreePath: string) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeGitChanged = vi.fn((nextListener: (workspaceWorktreePath: string) => void) => {
    listener = nextListener;
    return () => {
      unsubscribe();
      listener = null;
    };
  });

  return {
    subscribeGitChanged,
    unsubscribe,
    emit(workspaceWorktreePath: string) {
      listener?.(workspaceWorktreePath);
    },
  };
}

/**
 * Creates one in-memory workspace.files.changed subscription harness.
 */
function createWorkspaceFilesChangedHarness() {
  let listener: ((workspaceWorktreePath: string, changedRelativePaths?: string[]) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeWorkspaceFilesChanged = vi.fn(
    (nextListener: (workspaceWorktreePath: string, changedRelativePaths?: string[]) => void) => {
      listener = nextListener;
      return () => {
        unsubscribe();
        listener = null;
      };
    },
  );

  return {
    subscribeWorkspaceFilesChanged,
    unsubscribe,
    emit(workspaceWorktreePath: string, changedRelativePaths?: string[]) {
      listener?.(workspaceWorktreePath, changedRelativePaths);
    },
  };
}

/**
 * Creates one in-memory app.notification subscription harness.
 */
function createInAppNotificationHarness() {
  let listener: ((payload: RpcFrontendMessagePayload<"notificationEvent">) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeInAppNotification = vi.fn(
    (nextListener: (payload: RpcFrontendMessagePayload<"notificationEvent">) => void) => {
      listener = nextListener;
      return () => {
        unsubscribe();
        listener = null;
      };
    },
  );

  return {
    subscribeInAppNotification,
    unsubscribe,
    emit(payload: RpcFrontendMessagePayload<"notificationEvent">) {
      listener?.(payload);
    },
  };
}

function createDaemonConnectionStatusHarness() {
  let listener: ((status: "connected" | "connecting" | "disconnected") => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeDaemonConnectionStatus = vi.fn(
    (nextListener: (status: "connected" | "connecting" | "disconnected") => void) => {
      listener = nextListener;
      return () => {
        unsubscribe();
        listener = null;
      };
    },
  );

  return {
    subscribeDaemonConnectionStatus,
    unsubscribe,
    emit(status: "connected" | "connecting" | "disconnected") {
      listener?.(status);
    },
  };
}

function createWorkspacePullRequestUpdatedHarness() {
  let listener: ((payload: RpcFrontendMessagePayload<"workspacePullRequestUpdated">) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeWorkspacePullRequestUpdated = vi.fn(
    (nextListener: (payload: RpcFrontendMessagePayload<"workspacePullRequestUpdated">) => void) => {
      listener = nextListener;
      return () => {
        unsubscribe();
        listener = null;
      };
    },
  );

  return {
    subscribeWorkspacePullRequestUpdated,
    unsubscribe,
    emit(payload: RpcFrontendMessagePayload<"workspacePullRequestUpdated">) {
      listener?.(payload);
    },
  };
}

describe("createBackendEventStoreBindings", () => {
  it("subscribes once and forwards git changed events to store action", () => {
    vi.useFakeTimers();
    try {
    const harness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const daemonConnectionHarness = createDaemonConnectionStatusHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: harness.subscribeGitChanged,
      subscribeDaemonConnectionStatus: daemonConnectionHarness.subscribeDaemonConnectionStatus,
      listWorkspaceWorktreePaths: () => ["/tmp/repo/.worktrees/task-1"],
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    harness.emit("/tmp/repo/.worktrees/task-1");
    vi.advanceTimersByTime(2_000);

    expect(harness.subscribeGitChanged).toHaveBeenCalledTimes(1);
    expect(incrementGitRefreshVersion).toHaveBeenCalledWith("/tmp/repo/.worktrees/task-1");

    stopBindings();
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(workspaceFilesHarness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(inAppNotificationHarness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(daemonConnectionHarness.unsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forces file tree and git refresh after daemon reconnect", () => {
    vi.useFakeTimers();
    try {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const daemonConnectionHarness = createDaemonConnectionStatusHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    const startBindings = createBackendEventStoreBindings({
      subscribeDaemonConnectionStatus: daemonConnectionHarness.subscribeDaemonConnectionStatus,
      listWorkspaceWorktreePaths: () => ["/tmp/repo/.worktrees/task-1"],
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    daemonConnectionHarness.emit("connected");
    daemonConnectionHarness.emit("disconnected");
    daemonConnectionHarness.emit("connecting");
    daemonConnectionHarness.emit("connected");
    vi.advanceTimersByTime(2_000);

    expect(incrementFileTreeRefreshVersion).toHaveBeenCalledWith("/tmp/repo/.worktrees/task-1", []);
    expect(incrementGitRefreshVersion).toHaveBeenCalledWith("/tmp/repo/.worktrees/task-1");

    stopBindings();
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs clear diagnostics when reconnect recovery fails", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const daemonConnectionHarness = createDaemonConnectionStatusHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const startBindings = createBackendEventStoreBindings({
      subscribeDaemonConnectionStatus: daemonConnectionHarness.subscribeDaemonConnectionStatus,
      listWorkspaceWorktreePaths: () => {
        throw new Error("failed to enumerate workspaces");
      },
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    daemonConnectionHarness.emit("connected");
    daemonConnectionHarness.emit("disconnected");
    daemonConnectionHarness.emit("connected");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[backendEventStoreBindings] Failed to recover workspace views after daemon reconnect",
      expect.any(Error),
    );

    stopBindings();
    consoleErrorSpy.mockRestore();
  });

  it("forwards workspace file updates to file tree and git refresh actions", () => {
    vi.useFakeTimers();
    try {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    workspaceFilesHarness.emit("/tmp/repo/.worktrees/task-1", ["src/test.md"]);
    vi.advanceTimersByTime(2_000);

    expect(incrementFileTreeRefreshVersion).toHaveBeenCalledTimes(1);
    expect(incrementFileTreeRefreshVersion).toHaveBeenCalledWith("/tmp/repo/.worktrees/task-1", ["src/test.md"]);
    expect(incrementGitRefreshVersion).toHaveBeenCalledTimes(1);
    expect(incrementGitRefreshVersion).toHaveBeenCalledWith("/tmp/repo/.worktrees/task-1");

    stopBindings();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stores workspace pull request updates", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const prHarness = createWorkspacePullRequestUpdatedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const setWorkspacePullRequest = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeWorkspacePullRequestUpdated: prHarness.subscribeWorkspacePullRequestUpdated,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      setWorkspacePullRequest,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    prHarness.emit({
      workspaceId: "workspace-1",
      workspaceWorktreePath: "/tmp/repo",
      pullRequest: { number: 42, title: "PR" },
    });

    expect(setWorkspacePullRequest).toHaveBeenCalledWith("workspace-1", { number: 42, title: "PR" });

    stopBindings();
  });

  it("tracks running counts from observer lifecycle notification payloads without double-counting duplicates", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();

    inAppNotificationHarness.emit({
      id: "notification-1",
      title: "codex running",
      tone: "success",
      createdAt: "2026-04-03T10:00:00.000Z",
      workspaceId: "workspace-1",
      silent: true,
      observerStatus: {
        sessionKey: "workspace-1:tab-1:pane-1",
        normalizedEventType: "start",
      },
    });
    inAppNotificationHarness.emit({
      id: "notification-2",
      title: "codex running",
      tone: "success",
      createdAt: "2026-04-03T10:00:01.000Z",
      workspaceId: "workspace-1",
      silent: true,
      observerStatus: {
        sessionKey: "workspace-1:tab-1:pane-1",
        normalizedEventType: "start",
      },
    });
    inAppNotificationHarness.emit({
      id: "notification-3",
      title: "codex needs input",
      tone: "error",
      createdAt: "2026-04-03T10:00:02.000Z",
      workspaceId: "workspace-1",
      observerStatus: {
        sessionKey: "workspace-1:tab-1:pane-1",
        normalizedEventType: "wait_input",
      },
    });
    inAppNotificationHarness.emit({
      id: "notification-4",
      title: "codex finished",
      tone: "success",
      createdAt: "2026-04-03T10:00:03.000Z",
      workspaceId: "workspace-1",
      showSystemNotification: true,
      soundToPlay: {
        soundId: "chime",
        volume: 0.8,
      },
      observerStatus: {
        sessionKey: "workspace-1:tab-1:pane-1",
        normalizedEventType: "stop",
      },
    });
    inAppNotificationHarness.emit({
      id: "notification-5",
      title: "codex finished",
      tone: "success",
      createdAt: "2026-04-03T10:00:04.000Z",
      workspaceId: "workspace-1",
      showSystemNotification: true,
      soundToPlay: {
        soundId: "ping",
        volume: 0.6,
      },
      observerStatus: {
        sessionKey: "workspace-1:tab-1:pane-1",
        normalizedEventType: "stop",
      },
    });

    expect(setWorkspaceAgentStatusByWorkspaceId).toHaveBeenNthCalledWith(1, { "workspace-1": "running" });
    expect(setWorkspaceAgentStatusByWorkspaceId).toHaveBeenNthCalledWith(2, { "workspace-1": "running" });
    expect(setWorkspaceAgentStatusByWorkspaceId).toHaveBeenNthCalledWith(3, { "workspace-1": "waiting_input" });
    expect(setWorkspaceAgentStatusByWorkspaceId).toHaveBeenNthCalledWith(4, {});
    expect(setWorkspaceAgentStatusByWorkspaceId).toHaveBeenNthCalledWith(5, {});
    expect(dispatchSystemNotification).toHaveBeenCalledTimes(2);
    expect(dispatchSystemNotification).toHaveBeenNthCalledWith(1, {
      title: "codex finished",
      body: undefined,
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(2);
    expect(playNotificationSound).toHaveBeenNthCalledWith(1, {
      soundId: "chime",
      volume: 0.8,
    });
    expect(playNotificationSound).toHaveBeenNthCalledWith(2, {
      soundId: "ping",
      volume: 0.6,
    });

    stopBindings();
  });

  it("records workspace unread tones from in-app notifications", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    inAppNotificationHarness.emit({
      id: "notification-1",
      title: "Run finished",
      tone: "success",
      createdAt: "2026-04-03T10:00:00.000Z",
      workspaceId: "workspace-1",
    });
    inAppNotificationHarness.emit({
      id: "notification-2",
      title: "Needs input",
      tone: "error",
      createdAt: "2026-04-03T10:00:01.000Z",
      workspaceId: "workspace-2",
    });
    inAppNotificationHarness.emit({
      id: "notification-2b",
      title: "Running",
      tone: "success",
      createdAt: "2026-04-03T10:00:01.500Z",
      workspaceId: "workspace-2",
      silent: true,
      observerStatus: {
        sessionKey: "workspace-2:tab-2:pane-2",
        normalizedEventType: "start",
      },
    });
    inAppNotificationHarness.emit({
      id: "notification-3",
      title: "Ignored",
      tone: "success",
      createdAt: "2026-04-03T10:00:02.000Z",
    });

    expect(recordWorkspaceUnreadNotification).toHaveBeenNthCalledWith(1, "workspace-1", "success");
    expect(recordWorkspaceUnreadNotification).toHaveBeenNthCalledWith(2, "workspace-2", "error");
    expect(recordWorkspaceUnreadNotification).toHaveBeenCalledTimes(2);
    expect(dispatchSystemNotification).not.toHaveBeenCalled();
    expect(playNotificationSound).not.toHaveBeenCalled();

    stopBindings();
  });

  it("applies notification preferences before dispatching preference-backed effects", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const getNotificationPreferences = vi.fn(async () => ({
      schemaVersion: 1,
      enabled: true,
      osEnabled: true,
      soundEnabled: true,
      volume: 0.4,
      focusOnClick: true,
      enabledEventTypes: ["run-finished" as const],
      eventSounds: {
        "run-finished": "zip" as const,
        "run-failed": "alert" as const,
        "pending-question": "ping" as const,
      },
      enabledCategories: ["ai-task" as const],
    }));

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      getNotificationPreferences,
    });

    const stopBindings = startBindings();
    inAppNotificationHarness.emit({
      id: "notification-1",
      title: "Run completed",
      tone: "success",
      createdAt: "2026-04-03T10:00:00.000Z",
      workspaceId: "workspace-1",
      notificationEventType: "run-finished",
    });
    inAppNotificationHarness.emit({
      id: "notification-2",
      title: "Run failed",
      tone: "error",
      createdAt: "2026-04-03T10:00:01.000Z",
      workspaceId: "workspace-1",
      notificationEventType: "run-failed",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getNotificationPreferences).toHaveBeenCalledTimes(2);
    expect(dispatchSystemNotification).toHaveBeenCalledTimes(1);
    expect(dispatchSystemNotification).toHaveBeenCalledWith({
      title: "Run completed",
      body: undefined,
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(playNotificationSound).toHaveBeenCalledWith({
      soundId: "zip",
      volume: 0.4,
    });

    stopBindings();
  });

  it("suppresses preference-backed effects when the relevant terminal is focused", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const getNotificationPreferences = vi.fn(async () => ({
      schemaVersion: 1,
      enabled: true,
      osEnabled: true,
      soundEnabled: true,
      volume: 0.4,
      focusOnClick: true,
      enabledEventTypes: ["run-finished" as const],
      eventSounds: {
        "run-finished": "zip" as const,
        "run-failed": "alert" as const,
        "pending-question": "ping" as const,
      },
      enabledCategories: ["ai-task" as const],
    }));

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      getNotificationPreferences,
      isRelevantTerminalFocused: () => true,
    });

    const stopBindings = startBindings();
    inAppNotificationHarness.emit({
      id: "notification-1",
      title: "Run completed",
      tone: "success",
      createdAt: "2026-04-03T10:00:00.000Z",
      workspaceId: "workspace-1",
      notificationEventType: "run-finished",
      observerStatus: {
        sessionKey: "workspace-1:tab-1:pane-1",
        normalizedEventType: "stop",
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getNotificationPreferences).not.toHaveBeenCalled();
    expect(dispatchSystemNotification).not.toHaveBeenCalled();
    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(recordWorkspaceUnreadNotification).toHaveBeenCalledWith("workspace-1", "success");

    stopBindings();
  });

  it("suppresses normal agent-cli exit system notifications and sounds", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const getNotificationPreferences = vi.fn(async () => ({
      schemaVersion: 1,
      enabled: true,
      osEnabled: true,
      soundEnabled: true,
      volume: 0.4,
      focusOnClick: true,
      enabledEventTypes: ["run-finished" as const],
      eventSounds: {
        "run-finished": "zip" as const,
        "run-failed": "alert" as const,
        "pending-question": "ping" as const,
      },
      enabledCategories: ["ai-task" as const],
    }));

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      getNotificationPreferences,
      isRelevantTerminalFocused: () => false,
    });

    const stopBindings = startBindings();
    inAppNotificationHarness.emit({
      id: "notification-1",
      agent: "agent-cli",
      title: "Run completed",
      tone: "success",
      createdAt: "2026-04-03T10:00:00.000Z",
      workspaceId: "workspace-1",
      notificationEventType: "run-finished",
      observerStatus: {
        sessionKey: "workspace-1:tab-1:pane-1",
        normalizedEventType: "stop",
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getNotificationPreferences).not.toHaveBeenCalled();
    expect(dispatchSystemNotification).not.toHaveBeenCalled();
    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(recordWorkspaceUnreadNotification).toHaveBeenCalledWith("workspace-1", "success");

    stopBindings();
  });

  it("plays the distinct pending-question sound through preference-backed effects", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const getNotificationPreferences = vi.fn(async () => ({
      schemaVersion: 1,
      enabled: true,
      osEnabled: true,
      soundEnabled: true,
      volume: 0.6,
      focusOnClick: true,
      enabledEventTypes: ["pending-question" as const],
      eventSounds: {
        "run-finished": "chime" as const,
        "run-failed": "alert" as const,
        "pending-question": "ping" as const,
      },
      enabledCategories: ["ai-task" as const],
    }));

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      getNotificationPreferences,
    });

    const stopBindings = startBindings();
    inAppNotificationHarness.emit({
      id: "notification-1",
      title: "Input Required",
      tone: "error",
      createdAt: "2026-04-03T10:00:00.000Z",
      workspaceId: "workspace-1",
      notificationEventType: "pending-question",
      observerStatus: {
        sessionKey: "workspace-1:tab-1:pane-1",
        normalizedEventType: "wait_input",
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dispatchSystemNotification).toHaveBeenCalledWith({
      title: "Input Required",
      body: undefined,
    });
    expect(playNotificationSound).toHaveBeenCalledWith({
      soundId: "ping",
      volume: 0.6,
    });
    expect(recordWorkspaceUnreadNotification).toHaveBeenCalledWith("workspace-1", "error");

    stopBindings();
  });

  it("rewrites workspace ids to workspace names for system notification copy", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const getNotificationPreferences = vi.fn(async () => ({
      schemaVersion: 1,
      enabled: true,
      osEnabled: true,
      soundEnabled: false,
      volume: 0.6,
      focusOnClick: true,
      enabledEventTypes: ["run-failed" as const],
      eventSounds: {
        "run-finished": "chime" as const,
        "run-failed": "alert" as const,
        "pending-question": "ping" as const,
      },
      enabledCategories: ["ai-task" as const],
    }));

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      getNotificationPreferences,
      resolveWorkspaceLabel: (workspaceId) => (workspaceId === "workspace-1" ? "Orders / Payments" : undefined),
    });

    const stopBindings = startBindings();
    inAppNotificationHarness.emit({
      id: "notification-1",
      title: "Run Failed",
      body: "Workspace workspace-1 has stopped with an error.",
      tone: "error",
      createdAt: "2026-04-03T10:00:00.000Z",
      workspaceId: "workspace-1",
      notificationEventType: "run-failed",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dispatchSystemNotification).toHaveBeenCalledWith({
      title: "Run Failed",
      body: "Workspace Orders / Payments has stopped with an error.",
    });
    stopBindings();
  });

  it("keeps original copy when workspace name is unavailable", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      resolveWorkspaceLabel: () => undefined,
    });

    const stopBindings = startBindings();
    inAppNotificationHarness.emit({
      id: "notification-1",
      title: "Run Failed",
      body: "Workspace workspace-2 has stopped with an error.",
      tone: "error",
      createdAt: "2026-04-03T10:00:00.000Z",
      workspaceId: "workspace-2",
      showSystemNotification: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dispatchSystemNotification).toHaveBeenCalledWith({
      title: "Run Failed",
      body: "Workspace workspace-2 has stopped with an error.",
    });
    stopBindings();
  });
});
