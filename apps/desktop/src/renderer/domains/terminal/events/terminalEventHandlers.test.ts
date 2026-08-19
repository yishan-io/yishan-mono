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
} from "../model/terminalCloseTombstones";

import { createTerminalEventHandlers } from "./terminalEventHandlers";

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

describe("createTerminalEventHandlers", () => {
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
        },
      ],
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

    const startBindings = createTerminalEventHandlers({
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
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
        },
      ],
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

    const startBindings = createTerminalEventHandlers({
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
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
        },
      ],
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

    const startBindings = createTerminalEventHandlers({
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
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
        },
      ],
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });
    recordExplicitlyClosedTerminalTabId("tab-closed-1");

    const startBindings = createTerminalEventHandlers({
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
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
        },
      ],
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

    const startBindings = createTerminalEventHandlers({
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
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
        },
      ],
    });
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });

    const startBindings = createTerminalEventHandlers({
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
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

  it("creates the task-run terminal tab from terminal.session.changed when completion carries no task-run session", () => {
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

    const startBindings = createTerminalEventHandlers({
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
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
        },
      ],
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

    const startBindings = createTerminalEventHandlers({
      subscribeTerminalSessionChanged: terminalSessionHarness.subscribeTerminalSessionChanged,
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
});
