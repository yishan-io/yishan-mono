import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
import { workspaceCreateProgressStore } from "../store/workspaceCreateProgressStore";
import { workspaceStore } from "../store/workspaceStore";
import { createBackendEventStoreBindings } from "./backendEventStoreBindings";

function createGitChangedHarness() {
  const subscribeGitChanged = vi.fn(
    (
      _listener: (
        workspaceId: string | undefined,
        workspaceWorktreePath: string,
        affectsBranch: boolean,
        currentBranch?: string,
      ) => void,
    ) => {
      return () => undefined;
    },
  );

  return { subscribeGitChanged };
}

function createWorkspaceFilesChangedHarness() {
  const subscribeWorkspaceFilesChanged = vi.fn(
    (
      _listener: (
        workspaceId: string | undefined,
        workspaceWorktreePath: string,
        changedRelativePaths?: string[],
      ) => void,
    ) => {
      return () => undefined;
    },
  );

  return { subscribeWorkspaceFilesChanged };
}

function createInAppNotificationHarness() {
  const subscribeInAppNotification = vi.fn(
    (_listener: (payload: RpcFrontendMessagePayload<"notificationEvent">) => void) => {
      return () => undefined;
    },
  );

  return { subscribeInAppNotification };
}

function createWorkspaceCreateStartedHarness() {
  let listener: ((payload: RpcFrontendMessagePayload<"workspaceCreateStarted">) => void) | null = null;
  const subscribeWorkspaceCreateStarted = vi.fn(
    (nextListener: (payload: RpcFrontendMessagePayload<"workspaceCreateStarted">) => void) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    },
  );

  return {
    subscribeWorkspaceCreateStarted,
    emit(payload: RpcFrontendMessagePayload<"workspaceCreateStarted">) {
      listener?.(payload);
    },
  };
}

function createWorkspaceCreateCompletedHarness() {
  let listener: ((payload: RpcFrontendMessagePayload<"workspaceCreateCompleted">) => void) | null = null;
  const subscribeWorkspaceCreateCompleted = vi.fn(
    (nextListener: (payload: RpcFrontendMessagePayload<"workspaceCreateCompleted">) => void) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    },
  );

  return {
    subscribeWorkspaceCreateCompleted,
    emit(payload: RpcFrontendMessagePayload<"workspaceCreateCompleted">) {
      listener?.(payload);
    },
  };
}

const initialWorkspaceStoreState = workspaceStore.getState();
const initialWorkspaceCreateProgressStoreState = workspaceCreateProgressStore.getState();

describe("backendEventStoreBindings create placeholder protection", () => {
  beforeEach(() => {
    workspaceStore.setState(initialWorkspaceStoreState, true);
    workspaceCreateProgressStore.setState(initialWorkspaceCreateProgressStoreState, true);
  });

  afterEach(() => {
    workspaceStore.setState(initialWorkspaceStoreState, true);
    workspaceCreateProgressStore.setState(initialWorkspaceCreateProgressStoreState, true);
  });

  it("marks create-start placeholders to survive transient missing snapshots", () => {
    const gitHarness = createGitChangedHarness();
    const workspaceFilesHarness = createWorkspaceFilesChangedHarness();
    const inAppNotificationHarness = createInAppNotificationHarness();
    const createStartedHarness = createWorkspaceCreateStartedHarness();
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
      subscribeWorkspaceCreateStarted: createStartedHarness.subscribeWorkspaceCreateStarted,
      incrementFileTreeRefreshVersion,
      incrementGitRefreshVersion,
      setWorkspaceAgentStatusByWorkspaceId,
      recordWorkspaceUnreadNotification,
      dispatchSystemNotification,
      playNotificationSound,
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

    expect(workspaceStore.getState().workspaces).toEqual([
      expect.objectContaining({
        id: "workspace-1",
        status: "provisioning",
        preserveOnMissingSnapshot: true,
      }),
    ]);
    stopBindings();
  });

  it("keeps missing-snapshot protection after create completion updates the placeholder", async () => {
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
          preserveOnMissingSnapshot: true,
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
        status: "active",
        worktreePath: "/tmp/repo/.worktrees/feature-a",
        preserveOnMissingSnapshot: true,
      }),
    ]);
    expect(loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    stopBindings();
  });
});
