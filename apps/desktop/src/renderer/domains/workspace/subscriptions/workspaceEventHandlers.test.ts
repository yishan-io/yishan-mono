// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";
import { chatStore } from "../../../domains/agent/state/chatStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceCreateProgressStore } from "../../../domains/workspace/state/workspaceCreateProgressStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import {
  __resetExplicitlyClosedTerminalTabIdsForTests,
  recordExplicitlyClosedTerminalTabId,
} from "../../terminal/runtime/terminalCloseTombstones";

import { createWorkspaceEventHandlers } from "./workspaceEventHandlers";

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

describe("createWorkspaceEventHandlers", () => {
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

      const startBindings = createWorkspaceEventHandlers({
        subscribeGitChanged: harness.subscribeGitChanged,
        subscribeDaemonConnectionStatus: daemonConnectionHarness.subscribeDaemonConnectionStatus,
        listWorkspaceWorktreePaths: () => ["/tmp/repo/.worktrees/task-1"],
        subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
        incrementFileTreeRefreshVersion,
        incrementGitRefreshVersion,
      });

      const stopBindings = startBindings();
      harness.emit("ws-1", "/tmp/repo/.worktrees/task-1");
      vi.advanceTimersByTime(2_000);

      expect(harness.subscribeGitChanged).toHaveBeenCalledTimes(1);
      expect(incrementGitRefreshVersion).toHaveBeenCalledWith("/tmp/repo/.worktrees/task-1");

      stopBindings();
      expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
      expect(workspaceFilesHarness.unsubscribe).toHaveBeenCalledTimes(1);
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

      const startBindings = createWorkspaceEventHandlers({
        subscribeDaemonConnectionStatus: daemonConnectionHarness.subscribeDaemonConnectionStatus,
        listWorkspaceWorktreePaths: () => ["/tmp/repo/.worktrees/task-1"],
        subscribeGitChanged: gitHarness.subscribeGitChanged,
        subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
        loadWorkspaceSnapshot,
        incrementFileTreeRefreshVersion,
        incrementGitRefreshVersion,
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

    const startBindings = createWorkspaceEventHandlers({
      subscribeDaemonConnectionStatus: daemonConnectionHarness.subscribeDaemonConnectionStatus,
      listWorkspaceWorktreePaths: () => {
        throw new Error("failed to enumerate workspaces");
      },
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
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

      const startBindings = createWorkspaceEventHandlers({
        subscribeGitChanged: gitHarness.subscribeGitChanged,
        subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
        incrementFileTreeRefreshVersion,
        incrementGitRefreshVersion,
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

    const startBindings = createWorkspaceEventHandlers({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeWorkspacePullRequestUpdated: prHarness.subscribeWorkspacePullRequestUpdated,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspacePullRequest,
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

      const startBindings = createWorkspaceEventHandlers({
        subscribeGitChanged: gitHarness.subscribeGitChanged,
        subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
        subscribeWorkspaceSnapshotChanged: snapshotHarness.subscribeWorkspaceSnapshotChanged,
        incrementFileTreeRefreshVersion,
        incrementGitRefreshVersion,
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

      const startBindings = createWorkspaceEventHandlers({
        subscribeGitChanged: gitHarness.subscribeGitChanged,
        subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
        subscribeWorkspaceSnapshotChanged: snapshotHarness.subscribeWorkspaceSnapshotChanged,
        incrementFileTreeRefreshVersion,
        incrementGitRefreshVersion,
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

      const startBindings = createWorkspaceEventHandlers({
        subscribeGitChanged: gitHarness.subscribeGitChanged,
        subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
        subscribeWorkspaceSnapshotChanged: snapshotHarness.subscribeWorkspaceSnapshotChanged,
        incrementFileTreeRefreshVersion,
        incrementGitRefreshVersion,
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

    const startBindings = createWorkspaceEventHandlers({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
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

  it("does not mutate a server-backed provisioning row on completion and triggers snapshot reload", async () => {
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

    const startBindings = createWorkspaceEventHandlers({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeWorkspaceCreateProgress: createProgressHarness.subscribeWorkspaceCreateProgress,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
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
        worktreePath: "",
        status: "provisioning",
      }),
    ]);
    expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    stopBindings();
  });

  it("does not mutate a server-backed provisioning row when completion has no progress entry", async () => {
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

    const startBindings = createWorkspaceEventHandlers({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
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
        worktreePath: "",
        status: "provisioning",
      }),
    ]);
    expect(workspaceCreateProgressStore.getState().progressByWorkspaceId["workspace-1"]).toBeUndefined();
    expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    stopBindings();
  });

  it("does not add a workspace row on create start, tracks progress, and reloads snapshot on completion", async () => {
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

    const startBindings = createWorkspaceEventHandlers({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeWorkspaceCreateStarted: createStartedHarness.subscribeWorkspaceCreateStarted,
      subscribeWorkspaceCreateProgress: createProgressHarness.subscribeWorkspaceCreateProgress,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
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

    expect(workspaceStore.getState().workspaces).toEqual([]);
    expect(workspaceCreateProgressStore.getState().progressByWorkspaceId["workspace-1"]).toBeUndefined();
    // Snapshot reload always fires on completion to pick up authoritative API
    // status and clear the provisioning spinner (even if daemon PATCH event
    // was dropped).
    expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);

    stopBindings();
  });

  it("opens an agent chat tab when workspace-create completion carries a task-run session", () => {
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

    workbenchNavigationStore.setState({
      activeWorkspaceId: "workspace-1",
    });
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
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });

    const startBindings = createWorkspaceEventHandlers({
      subscribeGitChanged: gitHarness.subscribeGitChanged,
      subscribeWorkspaceFilesChanged: workspaceFilesHarness.subscribeWorkspaceFilesChanged,
      subscribeWorkspaceCreateCompleted: createCompletedHarness.subscribeWorkspaceCreateCompleted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
    });

    const stopBindings = startBindings();
    createCompletedHarness.emit({
      workspaceId: "workspace-1",
      worktreePath: "/tmp/workspace-1",
      taskRunSessionId: "chat-task-1",
      taskRunTabId: "task-workspace-1",
      taskRunRuntime: "dsh",
      taskRunTitle: "Task: investigate bug",
      taskRunStatus: "started",
    } as RpcFrontendMessagePayload<"workspaceCreateCompleted">);

    expect(tabStore.getState().tabs).toHaveLength(1);
    expect(tabStore.getState().tabs[0]).toMatchObject({
      kind: "agent-chat",
      workspaceId: "workspace-1",
      title: "Task: investigate bug",
      id: "task-workspace-1",
      data: { sessionId: "chat-task-1", cwd: "/tmp/workspace-1", runtime: "dsh", sessionView: "full" },
    });

    createCompletedHarness.emit({
      workspaceId: "workspace-1",
      worktreePath: "/tmp/workspace-1",
      taskRunSessionId: "chat-task-1",
      taskRunTabId: "task-workspace-1",
      taskRunRuntime: "dsh",
      taskRunTitle: "Task: investigate bug",
      taskRunStatus: "started",
    } as RpcFrontendMessagePayload<"workspaceCreateCompleted">);
    expect(tabStore.getState().tabs).toHaveLength(1);
    stopBindings();
  });
});
