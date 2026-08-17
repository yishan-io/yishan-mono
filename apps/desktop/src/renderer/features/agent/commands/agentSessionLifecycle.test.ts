// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";
import {
  __resetExplicitlyClosedTerminalTabIdsForTests,
  recordExplicitlyClosedTerminalTabId,
} from "../../../helpers/terminalCloseTombstones";
import { chatStore } from "../../../features/agent/state/chatStore";
import { tabStore } from "../../../features/workbench/state/tabStore";
import { workspaceCreateProgressStore } from "../../../features/workspace/state/workspaceCreateProgressStore";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";

import { createNotificationEventHandlers } from "../../notification/events/notificationEventHandlers";
import { clearTerminalAgentStatus } from "./agentSessionLifecycle";

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

describe("clearTerminalAgentStatus", () => {
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

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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
