import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
import {
  __resetExplicitlyClosedTerminalTabIdsForTests,
  recordExplicitlyClosedTerminalTabId,
} from "../helpers/terminalCloseTombstones";
import { chatStore } from "../store/chatStore";
import { tabStore } from "../store/tabStore";
import { workspaceCreateProgressStore } from "../store/workspaceCreateProgressStore";
import { workspaceStore } from "../store/workspaceStore";
import { clearTerminalAgentStatus, createBackendEventStoreBindings } from "./backendEventStoreBindings";

/**
 * Creates one in-memory git.changed subscription harness.
 */
function createGitChangedHarness() {
  let listener:
    | ((
        workspaceId: string | undefined,
        workspaceWorktreePath: string,
        affectsBranch: boolean,
        currentBranch?: string,
      ) => void)
    | null = null;
  const unsubscribe = vi.fn();
  const subscribeGitChanged = vi.fn(
    (
      nextListener: (
        workspaceId: string | undefined,
        workspaceWorktreePath: string,
        affectsBranch: boolean,
        currentBranch?: string,
      ) => void,
    ) => {
      listener = nextListener;
      return () => {
        unsubscribe();
        listener = null;
      };
    },
  );

  return {
    subscribeGitChanged,
    unsubscribe,
    emit(workspaceId: string | undefined, workspaceWorktreePath: string, affectsBranch = true, currentBranch?: string) {
      listener?.(workspaceId, workspaceWorktreePath, affectsBranch, currentBranch);
    },
  };
}

/**
 * Creates one in-memory workspace.files.changed subscription harness.
 */
function createWorkspaceFilesChangedHarness() {
  let listener:
    | ((workspaceId: string | undefined, workspaceWorktreePath: string, changedRelativePaths?: string[]) => void)
    | null = null;
  const unsubscribe = vi.fn();
  const subscribeWorkspaceFilesChanged = vi.fn(
    (
      nextListener: (
        workspaceId: string | undefined,
        workspaceWorktreePath: string,
        changedRelativePaths?: string[],
      ) => void,
    ) => {
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
    emit(workspaceId: string | undefined, workspaceWorktreePath: string, changedRelativePaths?: string[]) {
      listener?.(workspaceId, workspaceWorktreePath, changedRelativePaths);
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

function createWorkspaceSnapshotChangedHarness() {
  let listener: ((payload: RpcFrontendMessagePayload<"workspaceSnapshotChanged">) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeWorkspaceSnapshotChanged = vi.fn(
    (nextListener: (payload: RpcFrontendMessagePayload<"workspaceSnapshotChanged">) => void) => {
      listener = nextListener;
      return () => {
        unsubscribe();
        listener = null;
      };
    },
  );

  return {
    subscribeWorkspaceSnapshotChanged,
    unsubscribe,
    emit(payload: RpcFrontendMessagePayload<"workspaceSnapshotChanged">) {
      listener?.(payload);
    },
  };
}

function createWorkspaceCreateCompletedHarness() {
  let listener: ((payload: RpcFrontendMessagePayload<"workspaceCreateCompleted">) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeWorkspaceCreateCompleted = vi.fn(
    (nextListener: (payload: RpcFrontendMessagePayload<"workspaceCreateCompleted">) => void) => {
      listener = nextListener;
      return () => {
        unsubscribe();
        listener = null;
      };
    },
  );

  return {
    subscribeWorkspaceCreateCompleted,
    unsubscribe,
    emit(payload: RpcFrontendMessagePayload<"workspaceCreateCompleted">) {
      listener?.(payload);
    },
  };
}

function createWorkspaceCreateStartedHarness() {
  let listener: ((payload: RpcFrontendMessagePayload<"workspaceCreateStarted">) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeWorkspaceCreateStarted = vi.fn(
    (nextListener: (payload: RpcFrontendMessagePayload<"workspaceCreateStarted">) => void) => {
      listener = nextListener;
      return () => {
        unsubscribe();
        listener = null;
      };
    },
  );

  return {
    subscribeWorkspaceCreateStarted,
    unsubscribe,
    emit(payload: RpcFrontendMessagePayload<"workspaceCreateStarted">) {
      listener?.(payload);
    },
  };
}

function createWorkspaceCreateProgressHarness() {
  let listener: ((payload: RpcFrontendMessagePayload<"workspaceCreateProgress">) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeWorkspaceCreateProgress = vi.fn(
    (nextListener: (payload: RpcFrontendMessagePayload<"workspaceCreateProgress">) => void) => {
      listener = nextListener;
      return () => {
        unsubscribe();
        listener = null;
      };
    },
  );

  return {
    subscribeWorkspaceCreateProgress,
    unsubscribe,
    emit(payload: RpcFrontendMessagePayload<"workspaceCreateProgress">) {
      listener?.(payload);
    },
  };
}

function createTerminalSessionChangedHarness() {
  let listener: ((payload: RpcFrontendMessagePayload<"terminalSessionChanged">) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeTerminalSessionChanged = vi.fn(
    (nextListener: (payload: RpcFrontendMessagePayload<"terminalSessionChanged">) => void) => {
      listener = nextListener;
      return () => {
        unsubscribe();
        listener = null;
      };
    },
  );

  return {
    subscribeTerminalSessionChanged,
    unsubscribe,
    emit(payload: RpcFrontendMessagePayload<"terminalSessionChanged">) {
      listener?.(payload);
    },
  };
}

const initialTabStoreState = tabStore.getState();
const initialWorkspaceStoreState = workspaceStore.getState();
const initialWorkspaceCreateProgressStoreState = workspaceCreateProgressStore.getState();

describe("createBackendEventStoreBindings", () => {
  beforeEach(() => {
    tabStore.setState(initialTabStoreState, true);
    workspaceStore.setState(initialWorkspaceStoreState, true);
    workspaceCreateProgressStore.setState(initialWorkspaceCreateProgressStoreState, true);
    __resetExplicitlyClosedTerminalTabIdsForTests();
  });

  afterEach(() => {
    tabStore.setState(initialTabStoreState, true);
    workspaceStore.setState(initialWorkspaceStoreState, true);
    workspaceCreateProgressStore.setState(initialWorkspaceCreateProgressStoreState, true);
    __resetExplicitlyClosedTerminalTabIdsForTests();
  });

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
      harness.emit("ws-1", "/tmp/repo/.worktrees/task-1");
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

  it("forces file tree and git refresh after daemon reconnect", async () => {
    vi.useFakeTimers();
    try {
      const gitHarness = createGitChangedHarness();
      const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
      const inAppNotificationHarness = createInAppNotificationHarness();
      const daemonConnectionHarness = createDaemonConnectionStatusHarness();
      const incrementFileTreeRefreshVersion = vi.fn();
      const incrementGitRefreshVersion = vi.fn();
      const loadWorkspaceSnapshot = vi.fn(async () => undefined);
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
        loadWorkspaceSnapshot,
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
      await Promise.resolve();
      vi.advanceTimersByTime(2_000);

      expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
      expect(incrementFileTreeRefreshVersion).toHaveBeenCalledWith("/tmp/repo/.worktrees/task-1", []);
      expect(incrementGitRefreshVersion).toHaveBeenCalledWith("/tmp/repo/.worktrees/task-1");

      stopBindings();
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs clear diagnostics when reconnect recovery fails", async () => {
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
    const loadWorkspaceSnapshot = vi.fn(async () => undefined);
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
      loadWorkspaceSnapshot,
    });

    const stopBindings = startBindings();
    daemonConnectionHarness.emit("connected");
    daemonConnectionHarness.emit("disconnected");
    daemonConnectionHarness.emit("connected");
    await Promise.resolve();

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
      workspaceFilesHarness.emit("ws-1", "/tmp/repo/.worktrees/task-1", ["src/test.md"]);
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

  it("refreshes workspace snapshot on matching organization invalidation", async () => {
    vi.useFakeTimers();
    try {
      const gitHarness = createGitChangedHarness();
      const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
      const inAppNotificationHarness = createInAppNotificationHarness();
      const snapshotHarness = createWorkspaceSnapshotChangedHarness();
      const incrementFileTreeRefreshVersion = vi.fn();
      const incrementGitRefreshVersion = vi.fn();
      const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
      const recordWorkspaceUnreadNotification = vi.fn();
      const dispatchSystemNotification = vi.fn(async () => undefined);
      const playNotificationSound = vi.fn(async () => undefined);
      const loadWorkspaceSnapshot = vi.fn(async () => undefined);

      const startBindings = createBackendEventStoreBindings({
        subscribeGitChanged: gitHarness.subscribeGitChanged,
        subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
        subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
        subscribeWorkspaceSnapshotChanged: snapshotHarness.subscribeWorkspaceSnapshotChanged,
        incrementFileTreeRefreshVersion,
        incrementGitRefreshVersion,
        setWorkspaceAgentStatusByWorkspaceId,
        recordWorkspaceUnreadNotification,
        dispatchSystemNotification,
        playNotificationSound,
        loadWorkspaceSnapshot,
        getSelectedOrganizationId: () => "org-1",
      });

      const stopBindings = startBindings();
      snapshotHarness.emit({
        organizationId: "org-1",
        resource: "workspace",
        change: "created",
        projectId: "project-1",
        workspaceId: "workspace-1",
      });
      vi.advanceTimersByTime(300);
      await Promise.resolve();

      expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
      stopBindings();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still refreshes workspace snapshot when selected organization is unavailable", async () => {
    vi.useFakeTimers();
    try {
      const gitHarness = createGitChangedHarness();
      const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
      const inAppNotificationHarness = createInAppNotificationHarness();
      const snapshotHarness = createWorkspaceSnapshotChangedHarness();
      const incrementFileTreeRefreshVersion = vi.fn();
      const incrementGitRefreshVersion = vi.fn();
      const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
      const recordWorkspaceUnreadNotification = vi.fn();
      const dispatchSystemNotification = vi.fn(async () => undefined);
      const playNotificationSound = vi.fn(async () => undefined);
      const loadWorkspaceSnapshot = vi.fn(async () => undefined);

      const startBindings = createBackendEventStoreBindings({
        subscribeGitChanged: gitHarness.subscribeGitChanged,
        subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
        subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
        subscribeWorkspaceSnapshotChanged: snapshotHarness.subscribeWorkspaceSnapshotChanged,
        incrementFileTreeRefreshVersion,
        incrementGitRefreshVersion,
        setWorkspaceAgentStatusByWorkspaceId,
        recordWorkspaceUnreadNotification,
        dispatchSystemNotification,
        playNotificationSound,
        loadWorkspaceSnapshot,
        getSelectedOrganizationId: () => undefined,
      });

      const stopBindings = startBindings();
      snapshotHarness.emit({
        organizationId: "org-1",
        resource: "workspace",
        change: "created",
        projectId: "project-1",
        workspaceId: "workspace-1",
      });
      vi.advanceTimersByTime(300);
      await Promise.resolve();

      expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
      stopBindings();
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs a follow-up workspace snapshot refresh when another invalidation arrives before the first refresh runs", async () => {
    vi.useFakeTimers();
    try {
      const gitHarness = createGitChangedHarness();
      const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
      const inAppNotificationHarness = createInAppNotificationHarness();
      const snapshotHarness = createWorkspaceSnapshotChangedHarness();
      const incrementFileTreeRefreshVersion = vi.fn();
      const incrementGitRefreshVersion = vi.fn();
      const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
      const recordWorkspaceUnreadNotification = vi.fn();
      const dispatchSystemNotification = vi.fn(async () => undefined);
      const playNotificationSound = vi.fn(async () => undefined);
      const loadWorkspaceSnapshot = vi.fn(async () => undefined);

      const startBindings = createBackendEventStoreBindings({
        subscribeGitChanged: gitHarness.subscribeGitChanged,
        subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
        subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
        subscribeWorkspaceSnapshotChanged: snapshotHarness.subscribeWorkspaceSnapshotChanged,
        incrementFileTreeRefreshVersion,
        incrementGitRefreshVersion,
        setWorkspaceAgentStatusByWorkspaceId,
        recordWorkspaceUnreadNotification,
        dispatchSystemNotification,
        playNotificationSound,
        loadWorkspaceSnapshot,
        getSelectedOrganizationId: () => "org-1",
      });

      const stopBindings = startBindings();
      snapshotHarness.emit({
        organizationId: "org-1",
        resource: "workspace",
        change: "created",
        projectId: "project-1",
        workspaceId: "workspace-1",
      });
      snapshotHarness.emit({
        organizationId: "org-1",
        resource: "workspace",
        change: "updated",
        projectId: "project-1",
        workspaceId: "workspace-1",
      });

      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
      expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
      expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(2);
      stopBindings();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes workspace snapshot when create completion arrives before the placeholder exists", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const createCompletedHarness = createWorkspaceCreateCompletedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const loadWorkspaceSnapshot = vi.fn(async () => undefined);

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      loadWorkspaceSnapshot,
    });

    const stopBindings = startBindings();
    createCompletedHarness.emit({
      workspaceId: "workspace-1",
      worktreePath: "/tmp/repo/.worktrees/feature-a",
    });
    await Promise.resolve();

    expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    stopBindings();
  });

  it("marks the placeholder workspace active on completion and triggers snapshot reload", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const createProgressHarness = createWorkspaceCreateProgressHarness();
    const createCompletedHarness = createWorkspaceCreateCompletedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const loadWorkspaceSnapshot = vi.fn(async () => undefined);

    workspaceStore.setState((state) => ({
      ...state,
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "project-1",
          repoId: "project-1",
          name: "feature-a",
          title: "feature-a",
          sourceBranch: "main",
          branch: "feature-a",
          summaryId: "workspace-1",
          worktreePath: "",
          nodeId: "node-1",
          kind: "managed",
          status: "provisioning",
        },
      ],
    }));

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeWorkspaceCreateProgress: createProgressHarness.subscribeWorkspaceCreateProgress,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      loadWorkspaceSnapshot,
    });

    const stopBindings = startBindings();
    createProgressHarness.emit({
      workspaceId: "workspace-1",
      stepId: "worktree",
      label: "Fetch & create worktree",
      status: "running",
      createdAt: "2026-06-28T01:00:00.000Z",
    });
    createCompletedHarness.emit({
      workspaceId: "workspace-1",
      worktreePath: "/tmp/repo/.worktrees/feature-a",
    });
    await Promise.resolve();

    expect(workspaceStore.getState().workspaces).toEqual([
      expect.objectContaining({
        id: "workspace-1",
        worktreePath: "/tmp/repo/.worktrees/feature-a",
        status: "active",
      }),
    ]);
    expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    stopBindings();
  });

  it("marks the placeholder workspace active on completion even when no progress entry exists", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const createCompletedHarness = createWorkspaceCreateCompletedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const loadWorkspaceSnapshot = vi.fn(async () => undefined);

    workspaceStore.setState((state) => ({
      ...state,
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "project-1",
          repoId: "project-1",
          name: "feature-a",
          title: "feature-a",
          sourceBranch: "main",
          branch: "feature-a",
          summaryId: "workspace-1",
          worktreePath: "",
          nodeId: "node-1",
          kind: "managed",
          status: "provisioning",
        },
      ],
    }));

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      loadWorkspaceSnapshot,
    });

    const stopBindings = startBindings();
    createCompletedHarness.emit({
      workspaceId: "workspace-1",
      worktreePath: "/tmp/repo/.worktrees/feature-a",
    });
    await Promise.resolve();

    expect(workspaceStore.getState().workspaces).toEqual([
      expect.objectContaining({
        id: "workspace-1",
        worktreePath: "/tmp/repo/.worktrees/feature-a",
        status: "active",
      }),
    ]);
    expect(workspaceCreateProgressStore.getState().progressByWorkspaceId["workspace-1"]).toBeUndefined();
    expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    stopBindings();
  });

  it("adds a placeholder row on create start, tracks progress, finalizes on completion, and reloads snapshot", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const createStartedHarness = createWorkspaceCreateStartedHarness();
    const createProgressHarness = createWorkspaceCreateProgressHarness();
    const createCompletedHarness = createWorkspaceCreateCompletedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const loadWorkspaceSnapshot = vi.fn(async () => undefined);

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeWorkspaceCreateStarted: createStartedHarness.subscribeWorkspaceCreateStarted,
      subscribeWorkspaceCreateProgress: createProgressHarness.subscribeWorkspaceCreateProgress,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      loadWorkspaceSnapshot,
    });

    const stopBindings = startBindings();
    createStartedHarness.emit({
      workspaceId: "workspace-1",
      organizationId: "org-1",
      projectId: "project-1",
      workspaceName: "feature-a",
      sourceBranch: "main",
      branch: "feature-a",
      nodeId: "node-1",
    });
    createProgressHarness.emit({
      workspaceId: "workspace-1",
      stepId: "worktree",
      label: "Fetch & create worktree",
      status: "running",
      createdAt: "2026-06-28T01:00:00.000Z",
    });
    createCompletedHarness.emit({
      workspaceId: "workspace-1",
      worktreePath: "/tmp/repo/.worktrees/feature-a",
    });
    await Promise.resolve();

    expect(workspaceStore.getState().workspaces).toEqual([
      expect.objectContaining({
        id: "workspace-1",
        organizationId: "org-1",
        projectId: "project-1",
        repoId: "project-1",
        name: "feature-a",
        sourceBranch: "main",
        branch: "feature-a",
        worktreePath: "/tmp/repo/.worktrees/feature-a",
        nodeId: "node-1",
      }),
    ]);
    expect(workspaceCreateProgressStore.getState().progressByWorkspaceId["workspace-1"]).toBeUndefined();
    // Snapshot reload always fires on completion to pick up authoritative API
    // status and clear the provisioning spinner (even if daemon PATCH event
    // was dropped).
    expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);

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
      silent: true,
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

  it("binds a created terminal session back onto the requesting tab without opening a duplicate", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const terminalSessionHarness = createTerminalSessionChangedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    workspaceStore.setState({
      ...workspaceStore.getState(),
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          title: "Workspace 1",
          repoId: "repo-1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
        },
      ],
      selectedWorkspaceId: "workspace-1",
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal", paneId: "pane-tab-1" },
        },
      ],
      selectedTabId: "tab-1",
      selectedTabIdByWorkspaceId: { "workspace-1": "tab-1" },
    });

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    terminalSessionHarness.emit({
      action: "created",
      sessionId: "term-1",
      workspaceId: "workspace-1",
      tabId: "tab-1",
      paneId: "pane-tab-1",
      pid: 1234,
      status: "running",
    });

    expect(tabStore.getState().tabs).toHaveLength(1);
    expect(tabStore.getState().tabs[0]).toMatchObject({
      id: "tab-1",
      kind: "terminal",
      data: { sessionId: "term-1" },
    });

    stopBindings();
  });

  it("preserves a user-renamed terminal title when lifecycle metadata arrives", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const terminalSessionHarness = createTerminalSessionChangedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    workspaceStore.setState({
      ...workspaceStore.getState(),
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          title: "Workspace 1",
          repoId: "repo-1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
        },
      ],
      selectedWorkspaceId: "workspace-1",
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "My Custom Task",
          pinned: false,
          kind: "terminal",
          data: { title: "My Custom Task", paneId: "pane-tab-1", userRenamed: true },
        },
      ],
      selectedTabId: "tab-1",
      selectedTabIdByWorkspaceId: { "workspace-1": "tab-1" },
    });

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    terminalSessionHarness.emit({
      action: "created",
      sessionId: "term-1",
      workspaceId: "workspace-1",
      tabId: "tab-1",
      paneId: "pane-tab-1",
      title: "Task: investigate bug",
      agentKind: "opencode",
      pid: 1234,
      status: "running",
    });

    expect(tabStore.getState().tabs).toHaveLength(1);
    expect(tabStore.getState().tabs[0]).toMatchObject({
      id: "tab-1",
      title: "My Custom Task",
      kind: "terminal",
      data: { sessionId: "term-1", userRenamed: true, agentKind: "opencode" },
    });

    stopBindings();
  });

  it("closes only the single correlated terminal tab after created and destroyed events", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const terminalSessionHarness = createTerminalSessionChangedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    workspaceStore.setState({
      ...workspaceStore.getState(),
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          title: "Workspace 1",
          repoId: "repo-1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
        },
      ],
      selectedWorkspaceId: "workspace-1",
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal" },
        },
      ],
      selectedTabId: "tab-1",
      selectedTabIdByWorkspaceId: { "workspace-1": "tab-1" },
    });

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    terminalSessionHarness.emit({
      action: "created",
      sessionId: "term-1",
      workspaceId: "workspace-1",
      tabId: "tab-1",
      pid: 1234,
      status: "running",
    });
    terminalSessionHarness.emit({
      action: "destroyed",
      sessionId: "term-1",
      workspaceId: "workspace-1",
      tabId: "tab-1",
      pid: 1234,
      status: "exited",
    });

    expect(tabStore.getState().tabs).toHaveLength(0);

    stopBindings();
  });

  it("ignores late created terminal events for explicitly closed tabs and cleans up the orphan session", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const terminalSessionHarness = createTerminalSessionChangedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const closeTerminalSession = vi.fn(async () => undefined);

    workspaceStore.setState({
      ...workspaceStore.getState(),
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          title: "Workspace 1",
          repoId: "repo-1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
        },
      ],
      selectedWorkspaceId: "workspace-1",
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });
    recordExplicitlyClosedTerminalTabId("tab-closed-1");

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      closeTerminalSession,
    });

    const stopBindings = startBindings();
    terminalSessionHarness.emit({
      action: "created",
      sessionId: "term-orphan-1",
      workspaceId: "workspace-1",
      tabId: "tab-closed-1",
      paneId: "pane-tab-closed-1",
      pid: 1234,
      status: "running",
    });
    await Promise.resolve();

    expect(tabStore.getState().tabs).toHaveLength(0);
    expect(closeTerminalSession).toHaveBeenCalledWith("term-orphan-1");

    terminalSessionHarness.emit({
      action: "created",
      sessionId: "term-cross-client-1",
      workspaceId: "workspace-1",
      tabId: "tab-closed-1",
      paneId: "pane-tab-closed-1",
      pid: 5678,
      status: "running",
    });

    expect(tabStore.getState().tabs).toHaveLength(0);
    expect(closeTerminalSession).toHaveBeenCalledWith("term-cross-client-1");

    stopBindings();
  });

  it("records a tombstone on destroyed-triggered close so a late created does not reopen", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const terminalSessionHarness = createTerminalSessionChangedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);
    const closeTerminalSession = vi.fn(async () => undefined);

    workspaceStore.setState({
      ...workspaceStore.getState(),
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          title: "Workspace 1",
          repoId: "repo-1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
        },
      ],
      selectedWorkspaceId: "workspace-1",
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal" as const,
          data: { title: "Terminal", sessionId: "sess-1" },
        },
      ],
      selectedTabId: "tab-1",
      selectedTabIdByWorkspaceId: { "workspace-1": "tab-1" },
    });
    __resetExplicitlyClosedTerminalTabIdsForTests();

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
      closeTerminalSession,
    });

    const stopBindings = startBindings();

    terminalSessionHarness.emit({
      action: "destroyed",
      sessionId: "sess-1",
      workspaceId: "workspace-1",
      tabId: "tab-1",
      paneId: "pane-tab-1",
      pid: 1234,
      status: "exited",
    });
    await Promise.resolve();

    expect(tabStore.getState().tabs).toHaveLength(0);

    terminalSessionHarness.emit({
      action: "created",
      sessionId: "sess-2",
      workspaceId: "workspace-1",
      tabId: "tab-1",
      paneId: "pane-tab-1",
      pid: 9999,
      status: "running",
    });
    await Promise.resolve();

    expect(tabStore.getState().tabs).toHaveLength(0);
    expect(closeTerminalSession).toHaveBeenCalledWith("sess-2");

    stopBindings();
  });

  it("creates backend-driven terminal tabs from lifecycle metadata without title-based reuse", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const terminalSessionHarness = createTerminalSessionChangedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    workspaceStore.setState({
      ...workspaceStore.getState(),
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          title: "Workspace 1",
          repoId: "repo-1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
        },
      ],
      selectedWorkspaceId: "workspace-1",
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    terminalSessionHarness.emit({
      action: "created",
      sessionId: "term-task-1",
      workspaceId: "workspace-1",
      tabId: "task-tab-1",
      paneId: "pane-task-1",
      title: "Task: investigate bug",
      agentKind: "opencode",
      pid: 1234,
      status: "running",
    } as RpcFrontendMessagePayload<"terminalSessionChanged">);
    terminalSessionHarness.emit({
      action: "created",
      sessionId: "term-task-2",
      workspaceId: "workspace-1",
      tabId: "task-tab-2",
      paneId: "pane-task-2",
      title: "Task: investigate bug",
      agentKind: "opencode",
      pid: 5678,
      status: "running",
    } as RpcFrontendMessagePayload<"terminalSessionChanged">);

    expect(tabStore.getState().tabs).toHaveLength(2);
    expect(tabStore.getState().tabs).toMatchObject([
      {
        id: "task-tab-1",
        workspaceId: "workspace-1",
        title: "Task: investigate bug",
        kind: "terminal",
        data: { sessionId: "term-task-1", paneId: "pane-task-1", agentKind: "opencode" },
      },
      {
        id: "task-tab-2",
        workspaceId: "workspace-1",
        title: "Task: investigate bug",
        kind: "terminal",
        data: { sessionId: "term-task-2", paneId: "pane-task-2", agentKind: "opencode" },
      },
    ]);

    stopBindings();
  });

  it("does not let workspace-create completion open a second task-run terminal tab", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const terminalSessionHarness = createTerminalSessionChangedHarness();
    const createCompletedHarness = createWorkspaceCreateCompletedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    workspaceStore.setState({
      ...workspaceStore.getState(),
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          title: "Workspace 1",
          repoId: "repo-1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
          status: "provisioning",
          preserveOnMissingSnapshot: true,
          worktreePath: "",
        },
      ],
      selectedWorkspaceId: "workspace-1",
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    terminalSessionHarness.emit({
      action: "created",
      sessionId: "term-task-1",
      workspaceId: "workspace-1",
      tabId: "task-tab-1",
      paneId: "pane-task-1",
      title: "Task: investigate bug",
      agentKind: "opencode",
      pid: 1234,
      status: "running",
    } as RpcFrontendMessagePayload<"terminalSessionChanged">);
    createCompletedHarness.emit({
      workspaceId: "workspace-1",
      worktreePath: "/tmp/workspace-1",
      taskRunSessionId: "term-task-1",
      taskRunAgentKind: "opencode",
      taskRunPrompt: "investigate bug",
      taskRunTabId: "task-tab-1",
      taskRunPaneId: "pane-task-1",
    } as RpcFrontendMessagePayload<"workspaceCreateCompleted">);

    expect(tabStore.getState().tabs).toHaveLength(1);
    expect(tabStore.getState().tabs[0]).toMatchObject({
      id: "task-tab-1",
      kind: "terminal",
      title: "Task: investigate bug",
      data: { sessionId: "term-task-1", paneId: "pane-task-1", agentKind: "opencode" },
    });

    stopBindings();
  });

  it("creates the delegated task-run terminal tab when workspace completion arrives first", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const terminalSessionHarness = createTerminalSessionChangedHarness();
    const createCompletedHarness = createWorkspaceCreateCompletedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    workspaceStore.setState({
      ...workspaceStore.getState(),
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          title: "Workspace 1",
          repoId: "repo-1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
          status: "provisioning",
          preserveOnMissingSnapshot: true,
          worktreePath: "",
        },
      ],
      selectedWorkspaceId: "workspace-1",
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    createCompletedHarness.emit({
      workspaceId: "workspace-1",
      worktreePath: "/tmp/workspace-1",
    });

    expect(tabStore.getState().tabs).toHaveLength(0);

    terminalSessionHarness.emit({
      action: "created",
      sessionId: "term-task-1",
      workspaceId: "workspace-1",
      tabId: "task-tab-1",
      paneId: "pane-task-1",
      title: "Task: investigate bug",
      agentKind: "opencode",
      pid: 1234,
      status: "running",
    } as RpcFrontendMessagePayload<"terminalSessionChanged">);

    expect(tabStore.getState().tabs).toHaveLength(1);
    expect(tabStore.getState().tabs[0]).toMatchObject({
      id: "task-tab-1",
      kind: "terminal",
      title: "Task: investigate bug",
      data: { sessionId: "term-task-1", paneId: "pane-task-1", agentKind: "opencode" },
    });

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
      silent: true,
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(playNotificationSound).toHaveBeenCalledWith({
      soundId: "zip",
      volume: 0.4,
    });

    stopBindings();
  });

  it("deduplicates duplicate notification ids before replaying preference-backed effects", async () => {
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
    const duplicatedPayload = {
      id: "notification-duplicate",
      title: "Run completed",
      tone: "success" as const,
      createdAt: "2026-04-03T10:00:00.000Z",
      workspaceId: "workspace-1",
      notificationEventType: "run-finished" as const,
    };

    inAppNotificationHarness.emit(duplicatedPayload);
    inAppNotificationHarness.emit(duplicatedPayload);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(dispatchSystemNotification).toHaveBeenCalledTimes(1);
    expect(dispatchSystemNotification).toHaveBeenCalledWith({
      title: "Run completed",
      body: undefined,
      silent: true,
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(playNotificationSound).toHaveBeenCalledWith({
      soundId: "zip",
      volume: 0.4,
    });
    expect(recordWorkspaceUnreadNotification).toHaveBeenCalledTimes(1);
    expect(recordWorkspaceUnreadNotification).toHaveBeenCalledWith("workspace-1", "success");

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
      silent: true,
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
      silent: true,
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

  it("forwards explicit silent system notifications for legacy payloads", async () => {
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
      id: "notification-legacy-silent",
      title: "Run finished",
      body: "Quiet banner",
      tone: "success",
      createdAt: "2026-04-03T10:00:00.000Z",
      workspaceId: "workspace-1",
      showSystemNotification: true,
      silent: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dispatchSystemNotification).toHaveBeenCalledWith({
      title: "Run finished",
      body: "Quiet banner",
      silent: true,
    });
    expect(playNotificationSound).not.toHaveBeenCalled();

    stopBindings();
  });

  it("binds a created terminal session onto the requesting tab even when the tab already has a stale session id (daemon restart)", () => {
    // Regression: when the daemon restarts, existing terminal tabs keep their old
    // (now-stale) sessionId in the store.  reconnectAllTerminalSessions creates a new
    // daemon session carrying the original tabId.  The lifecycle event must update the
    // existing tab rather than opening a duplicate.
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const terminalSessionHarness = createTerminalSessionChangedHarness();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    workspaceStore.setState({
      ...workspaceStore.getState(),
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          title: "Workspace 1",
          repoId: "repo-1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-1",
        },
      ],
      selectedWorkspaceId: "workspace-1",
    });
    // Tab already has a stale sessionId from the previous daemon run.
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal", sessionId: "old-session-1", paneId: "pane-tab-1" },
        },
      ],
      selectedTabId: "tab-1",
      selectedTabIdByWorkspaceId: { "workspace-1": "tab-1" },
    });

    const startBindings = createBackendEventStoreBindings({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
    });

    const stopBindings = startBindings();
    // New daemon created a replacement session and sent the event with the original tabId.
    terminalSessionHarness.emit({
      action: "created",
      sessionId: "new-session-1",
      workspaceId: "workspace-1",
      tabId: "tab-1",
      paneId: "pane-tab-1",
      pid: 5678,
      status: "running",
    });

    // Must remain exactly one tab — no duplicate opened.
    expect(tabStore.getState().tabs).toHaveLength(1);
    // The existing tab must now carry the new session id.
    expect(tabStore.getState().tabs[0]).toMatchObject({
      id: "tab-1",
      kind: "terminal",
      data: { sessionId: "new-session-1" },
    });

    stopBindings();
  });

  it("clearTerminalAgentStatus removes lifecycle entries for a closed tab and clears workspace status", async () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const setWorkspaceAgentStatusByWorkspaceId = vi.fn();
    const incrementFileTreeRefreshVersion = vi.fn();
    const incrementGitRefreshVersion = vi.fn();
    const recordWorkspaceUnreadNotification = vi.fn();
    const dispatchSystemNotification = vi.fn(async () => undefined);
    const playNotificationSound = vi.fn(async () => undefined);

    const initialChatState = chatStore.getState();
    chatStore.setState({
      setWorkspaceAgentStatusByWorkspaceId,
    });

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
      id: "notif-1",
      title: "Run started",
      tone: "success",
      createdAt: "2026-06-26T10:00:00.000Z",
      workspaceId: "workspace-1",
      silent: true,
      observerStatus: {
        normalizedEventType: "start",
        sessionKey: "workspace-1:tab-agent-1:pane-1",
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setWorkspaceAgentStatusByWorkspaceId).toHaveBeenLastCalledWith({ "workspace-1": "running" });

    clearTerminalAgentStatus("tab-agent-1");

    expect(setWorkspaceAgentStatusByWorkspaceId).toHaveBeenLastCalledWith({});

    stopBindings();
    chatStore.setState(initialChatState, true);
  });
});
