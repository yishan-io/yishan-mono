// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";
import { chatStore } from "../../../domains/agent/state/chatStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceCreateProgressStore } from "../../../domains/workspace/state/workspaceCreateProgressStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import {
  __resetExplicitlyClosedTerminalTabIdsForTests,
  recordExplicitlyClosedTerminalTabId,
} from "../../../helpers/terminalCloseTombstones";

import { createNotificationEventHandlers } from "./notificationEventHandlers";

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

describe("createNotificationEventHandlers", () => {
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

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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
    }));

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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

    const startBindings = createNotificationEventHandlers({
      subscribeInAppNotification: inAppNotificationHarness.subscribeInAppNotification,
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
});
