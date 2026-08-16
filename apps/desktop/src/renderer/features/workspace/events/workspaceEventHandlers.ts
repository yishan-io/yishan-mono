/**
 * Workspace event handlers — owns all workspace-family backend events:
 * git.changed, workspace.files.changed, workspace.create.*, PR updates,
 * snapshot invalidation, and daemon-reconnect recovery, plus the refresh
 * deduplication and snapshot refresh policy.
 *
 * Phase 2 split from `backendEventStoreBindings.ts`. During the transition
 * this factory is consumed by the binding (no self-subscription); at Task 6
 * its default deps subscribe via the router selectors.
 */
import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";

import { subscribeBackendEvent } from "../../../app/events/backendEventRouter";
import { loadWorkspaceSnapshot } from "../../../commands/projectCommands";
import { buildWorkspaceCreatePlaceholder } from "../../../commands/workspaceStoreHelpers";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { subscribeDaemonConnectionStatus } from "../../../rpc/rpcTransport";
import { sessionStore } from "../../../store/sessionStore";
import { tabStore } from "../../../store/tabStore";
import { workspaceCreateProgressStore } from "../../../store/workspaceCreateProgressStore";
import { enqueueWorkspaceErrorNotice } from "../../../store/workspaceLifecycleNoticeStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { workspaceUiStore } from "../../../store/workspaceUiStore";

const GIT_REFRESH_COALESCE_MS = 2_000;
const WORKSPACE_SNAPSHOT_REFRESH_DEBOUNCE_MS = 300;

type WorkspaceCreateStartedPayload = RpcFrontendMessagePayload<"workspaceCreateStarted">;
type WorkspaceCreateProgressPayload = RpcFrontendMessagePayload<"workspaceCreateProgress">;
type WorkspaceCreateCompletedPayload = RpcFrontendMessagePayload<"workspaceCreateCompleted">;
type WorkspaceCreateFailedPayload = RpcFrontendMessagePayload<"workspaceCreateFailed">;
type WorkspacePullRequestUpdatedPayload = RpcFrontendMessagePayload<"workspacePullRequestUpdated">;
type WorkspaceSnapshotChangedPayload = RpcFrontendMessagePayload<"workspaceSnapshotChanged">;
type WorkspaceStateChangedPayload = RpcFrontendMessagePayload<"workspaceStateChanged">;

export type WorkspaceEventDependencies = {
  subscribeDaemonConnectionStatus?: (
    listener: (status: "connected" | "connecting" | "disconnected") => void,
  ) => () => void;
  subscribeGitChanged: (
    listener: (
      workspaceId: string | undefined,
      workspaceWorktreePath: string,
      affectsBranch: boolean,
      currentBranch?: string,
    ) => void,
  ) => () => void;
  subscribeWorkspaceFilesChanged: (
    listener: (workspaceId: string | undefined, workspaceWorktreePath: string, changedRelativePaths?: string[]) => void,
  ) => () => void;
  subscribeWorkspaceCreateStarted?: (listener: (payload: WorkspaceCreateStartedPayload) => void) => () => void;
  subscribeWorkspaceCreateProgress?: (listener: (payload: WorkspaceCreateProgressPayload) => void) => () => void;
  subscribeWorkspaceCreateCompleted?: (listener: (payload: WorkspaceCreateCompletedPayload) => void) => () => void;
  subscribeWorkspaceCreateFailed?: (listener: (payload: WorkspaceCreateFailedPayload) => void) => () => void;
  subscribeWorkspacePullRequestUpdated?: (
    listener: (payload: WorkspacePullRequestUpdatedPayload) => void,
  ) => () => void;
  subscribeWorkspaceSnapshotChanged?: (listener: (payload: WorkspaceSnapshotChangedPayload) => void) => () => void;
  subscribeWorkspaceStateChanged?: (listener: (payload: WorkspaceStateChangedPayload) => void) => () => void;
  listWorkspaceWorktreePaths?: () => string[];
  resolveWorkspaceIdByWorktreePath?: (worktreePath: string) => string | undefined;
  refreshWorkspaceCurrentBranch?: (workspaceId: string, currentBranch?: string) => Promise<void>;
  incrementFileTreeRefreshVersion: (workspaceWorktreePath?: string, changedRelativePaths?: string[]) => void;
  incrementGitRefreshVersion: (workspaceWorktreePath: string) => void;
  applyWorkspaceCreateStartedEvent?: (payload: WorkspaceCreateStartedPayload) => void;
  applyWorkspaceCreateProgressEvent?: (payload: WorkspaceCreateProgressPayload) => void;
  applyWorkspaceCreateCompletedEvent?: (payload: WorkspaceCreateCompletedPayload) => boolean;
  applyWorkspaceCreateFailedEvent?: (payload: WorkspaceCreateFailedPayload) => void;
  setWorkspacePullRequest?: (
    workspaceId: string,
    pullRequest: WorkspacePullRequestUpdatedPayload["pullRequest"],
  ) => void;
  loadWorkspaceSnapshot?: () => Promise<void>;
  getSelectedOrganizationId?: () => string | undefined;
  workspaceExistsLocally?: (workspaceId: string) => boolean;
};

/**
 * Default dependencies: real store actions + router subscribers. Used by
 * `startWorkspaceEventHandlers()` (production composition) and by tests that
 * do not inject a specific dep.
 */
export const DEFAULT_WORKSPACE_EVENT_DEPENDENCIES: WorkspaceEventDependencies = {
  subscribeDaemonConnectionStatus,
  subscribeGitChanged: (listener) =>
    subscribeBackendEvent("git.changed", (event) => {
      if (event.source !== "gitChanged") {
        return;
      }
      listener(
        event.payload.workspaceId,
        event.payload.workspaceWorktreePath,
        event.payload.affectsBranch ?? true,
        event.payload.currentBranch,
      );
    }),
  subscribeWorkspaceFilesChanged: (listener) =>
    subscribeBackendEvent("workspace.files.changed", (event) => {
      if (event.source !== "workspaceFilesChanged") {
        return;
      }
      listener(event.payload.workspaceId, event.payload.workspaceWorktreePath, event.payload.changedRelativePaths);
    }),
  subscribeWorkspaceCreateStarted: (listener) =>
    subscribeBackendEvent("workspace.create.started", (event) => {
      if (event.source !== "workspaceCreateStarted") {
        return;
      }
      listener(event.payload);
    }),
  subscribeWorkspaceCreateProgress: (listener) =>
    subscribeBackendEvent("workspace.create.progress", (event) => {
      if (event.source !== "workspaceCreateProgress") {
        return;
      }
      listener(event.payload);
    }),
  subscribeWorkspaceCreateCompleted: (listener) =>
    subscribeBackendEvent("workspace.create.completed", (event) => {
      if (event.source !== "workspaceCreateCompleted") {
        return;
      }
      listener(event.payload);
    }),
  subscribeWorkspaceCreateFailed: (listener) =>
    subscribeBackendEvent("workspace.create.failed", (event) => {
      if (event.source !== "workspaceCreateFailed") {
        return;
      }
      listener(event.payload);
    }),
  subscribeWorkspacePullRequestUpdated: (listener) =>
    subscribeBackendEvent("workspace.pull_request.updated", (event) => {
      if (event.source !== "workspacePullRequestUpdated") {
        return;
      }
      listener(event.payload);
    }),
  subscribeWorkspaceSnapshotChanged: (listener) =>
    subscribeBackendEvent("workspace.snapshot.changed", (event) => {
      if (event.source !== "workspaceSnapshotChanged") {
        return;
      }
      listener(event.payload);
    }),
  subscribeWorkspaceStateChanged: (listener) =>
    subscribeBackendEvent("workspace.state.changed", (event) => {
      if (event.source !== "workspaceStateChanged") {
        return;
      }
      listener(event.payload);
    }),
  listWorkspaceWorktreePaths: () =>
    workspaceStore
      .getState()
      .workspaces.map((workspace) => workspace.worktreePath?.trim() ?? "")
      .filter((workspaceWorktreePath) => workspaceWorktreePath.length > 0),
  resolveWorkspaceIdByWorktreePath: (worktreePath) => {
    const normalized = worktreePath.trim();
    return workspaceStore.getState().workspaces.find((ws) => ws.worktreePath?.trim() === normalized)?.id;
  },
  refreshWorkspaceCurrentBranch: async (workspaceId, currentBranch) => {
    if (currentBranch !== undefined) {
      workspaceStore.getState().setWorkspaceCurrentBranch(workspaceId, currentBranch);
      return;
    }
    try {
      const client = await getDaemonClient();
      const result = await client.git.inspect({ workspaceId });
      workspaceStore.getState().setWorkspaceCurrentBranch(workspaceId, result.currentBranch ?? "");
    } catch {
      // Non-fatal: cache stays stale until the next gitChanged event.
    }
  },
  incrementFileTreeRefreshVersion: (workspaceWorktreePath, changedRelativePaths) => {
    workspaceUiStore.getState().incrementFileTreeRefreshVersion(workspaceWorktreePath, changedRelativePaths);
  },
  incrementGitRefreshVersion: (workspaceWorktreePath) => {
    workspaceStore.getState().incrementGitRefreshVersion(workspaceWorktreePath);
  },
  applyWorkspaceCreateStartedEvent: (payload) => {
    workspaceStore.getState().addWorkspace(
      buildWorkspaceCreatePlaceholder({
        workspaceId: payload.workspaceId,
        projectId: payload.projectId,
        repoId: payload.projectId,
        organizationId: payload.organizationId,
        name: payload.workspaceName,
        sourceBranch: payload.sourceBranch,
        branch: payload.branch,
        worktreePath: "",
        nodeId: payload.nodeId,
        status: "provisioning",
        preserveOnMissingSnapshot: true,
      }),
    );
    workspaceCreateProgressStore.getState().startWorkspaceCreateProgress(payload.workspaceId);
  },
  applyWorkspaceCreateProgressEvent: (payload) => {
    workspaceCreateProgressStore.getState().applyWorkspaceCreateProgressEvent(payload);
  },
  applyWorkspaceCreateCompletedEvent: (payload) => {
    const store = workspaceStore.getState();
    const existing = store.workspaces.find((ws) => ws.id === payload.workspaceId);
    if (existing) {
      store.addWorkspace({
        workspaceId: existing.id,
        organizationId: existing.organizationId,
        projectId: existing.projectId,
        repoId: existing.repoId,
        name: existing.name,
        sourceBranch: existing.sourceBranch,
        branch: existing.branch,
        worktreePath: payload.worktreePath,
        nodeId: existing.nodeId,
        status: "active",
      });
    }
    workspaceCreateProgressStore.getState().clearWorkspaceCreateProgress(payload.workspaceId);

    const taskRunSessionId = payload.taskRunSessionId?.trim();
    if (taskRunSessionId && payload.worktreePath) {
      tabStore.getState().openTab({
        workspaceId: payload.workspaceId,
        kind: "agent-chat",
        ...(payload.taskRunTitle?.trim() ? { title: payload.taskRunTitle.trim() } : {}),
        cwd: payload.worktreePath,
        sessionId: taskRunSessionId,
      });
    }

    return Boolean(existing);
  },
  applyWorkspaceCreateFailedEvent: (payload) => {
    workspaceCreateProgressStore.getState().clearWorkspaceCreateProgress(payload.workspaceId);
    const store = workspaceStore.getState();
    const existing = store.workspaces.find((ws) => ws.id === payload.workspaceId);
    if (existing) {
      store.removeWorkspace({
        projectId: existing.projectId,
        repoId: existing.repoId,
        workspaceId: payload.workspaceId,
      });
    }
    enqueueWorkspaceErrorNotice({
      title: "Failed to create workspace",
      message: payload.message,
    });
  },
  setWorkspacePullRequest: (workspaceId, pullRequest) => {
    workspaceStore.getState().setWorkspacePullRequest(workspaceId, pullRequest);
  },
  loadWorkspaceSnapshot,
  getSelectedOrganizationId: () => sessionStore.getState().selectedOrganizationId,
  workspaceExistsLocally: (workspaceId) =>
    workspaceStore.getState().workspaces.some((workspace) => workspace.id === workspaceId),
};

/**
 * Starts workspace event handlers with default deps.
 */
export function startWorkspaceEventHandlers() {
  return createWorkspaceEventHandlers(DEFAULT_WORKSPACE_EVENT_DEPENDENCIES)();
}

/**
 * Creates one workspace event handler factory. Returns `start()` which
 * registers all workspace-family subscriptions and returns a teardown.
 */
export function createWorkspaceEventHandlers(dependencies: WorkspaceEventDependencies) {
  const resolvedDependencies = {
    ...DEFAULT_WORKSPACE_EVENT_DEPENDENCIES,
    ...dependencies,
  } satisfies WorkspaceEventDependencies;

  /** Starts workspace backend event listeners; returns one teardown function. */
  return function startWorkspaceEventHandlers() {
    const gitRefreshTimersByWorktreePath = new Map<string, ReturnType<typeof setTimeout>>();
    let workspaceSnapshotRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    let isWorkspaceSnapshotRefreshRunning = false;
    let shouldRunWorkspaceSnapshotRefreshAgain = false;

    const runWorkspaceSnapshotRefresh = () => {
      if (isWorkspaceSnapshotRefreshRunning) {
        shouldRunWorkspaceSnapshotRefreshAgain = true;
        return;
      }

      isWorkspaceSnapshotRefreshRunning = true;
      void dependencies
        .loadWorkspaceSnapshot?.()
        .catch((error) => {
          console.error("[backendEventStoreBindings] Failed to refresh workspace snapshot after invalidation", error);
        })
        .finally(() => {
          isWorkspaceSnapshotRefreshRunning = false;
          if (!shouldRunWorkspaceSnapshotRefreshAgain) {
            return;
          }

          shouldRunWorkspaceSnapshotRefreshAgain = false;
          workspaceSnapshotRefreshTimer = setTimeout(() => {
            workspaceSnapshotRefreshTimer = undefined;
            runWorkspaceSnapshotRefresh();
          }, WORKSPACE_SNAPSHOT_REFRESH_DEBOUNCE_MS);
        });
    };

    const scheduleWorkspaceSnapshotRefresh = () => {
      if (workspaceSnapshotRefreshTimer) {
        shouldRunWorkspaceSnapshotRefreshAgain = true;
        return;
      }

      workspaceSnapshotRefreshTimer = setTimeout(() => {
        workspaceSnapshotRefreshTimer = undefined;
        runWorkspaceSnapshotRefresh();
      }, WORKSPACE_SNAPSHOT_REFRESH_DEBOUNCE_MS);
    };

    const scheduleGitRefresh = (workspaceWorktreePath: string) => {
      const normalizedPath = workspaceWorktreePath.trim();
      if (!normalizedPath) {
        return;
      }
      if (gitRefreshTimersByWorktreePath.has(normalizedPath)) {
        return;
      }

      const timeoutId = setTimeout(() => {
        gitRefreshTimersByWorktreePath.delete(normalizedPath);
        resolvedDependencies.incrementGitRefreshVersion(normalizedPath);
      }, GIT_REFRESH_COALESCE_MS);
      gitRefreshTimersByWorktreePath.set(normalizedPath, timeoutId);
    };

    const unsubscribeGitChanged = resolvedDependencies.subscribeGitChanged(
      (workspaceId, workspaceWorktreePath, affectsBranch, currentBranch) => {
        scheduleGitRefresh(workspaceWorktreePath);

        if (affectsBranch) {
          const resolvedId =
            workspaceId ?? resolvedDependencies.resolveWorkspaceIdByWorktreePath?.(workspaceWorktreePath);
          if (resolvedId) {
            void resolvedDependencies.refreshWorkspaceCurrentBranch?.(resolvedId, currentBranch);
          }
        }
      },
    );
    let hasObservedConnectedState = false;
    let shouldRecoverWorkspaceViewsOnReconnect = false;
    const unsubscribeDaemonConnectionStatus = (
      resolvedDependencies.subscribeDaemonConnectionStatus ?? (() => () => {})
    )((status) => {
      if (status === "disconnected") {
        shouldRecoverWorkspaceViewsOnReconnect = true;
        return;
      }

      if (status !== "connected") {
        return;
      }

      if (!hasObservedConnectedState) {
        hasObservedConnectedState = true;
        return;
      }

      if (!shouldRecoverWorkspaceViewsOnReconnect) {
        return;
      }

      shouldRecoverWorkspaceViewsOnReconnect = false;

      void (async () => {
        try {
          await resolvedDependencies.loadWorkspaceSnapshot?.();

          const workspaceWorktreePaths = resolvedDependencies.listWorkspaceWorktreePaths?.() ?? [];
          for (const workspaceWorktreePath of workspaceWorktreePaths) {
            resolvedDependencies.incrementFileTreeRefreshVersion(workspaceWorktreePath, []);
            scheduleGitRefresh(workspaceWorktreePath);
          }
        } catch (error) {
          console.error("[backendEventStoreBindings] Failed to recover workspace views after daemon reconnect", error);
        }
      })();
    });
    const unsubscribeWorkspaceFilesChanged = resolvedDependencies.subscribeWorkspaceFilesChanged(
      (_workspaceId, workspaceWorktreePath, changedRelativePaths) => {
        resolvedDependencies.incrementFileTreeRefreshVersion(workspaceWorktreePath, changedRelativePaths);
        scheduleGitRefresh(workspaceWorktreePath);
      },
    );
    const unsubscribeWorkspaceCreateStarted =
      resolvedDependencies.subscribeWorkspaceCreateStarted?.((payload) => {
        resolvedDependencies.applyWorkspaceCreateStartedEvent?.(payload);
      }) ?? (() => {});
    const unsubscribeWorkspaceCreateProgress =
      resolvedDependencies.subscribeWorkspaceCreateProgress?.((payload) => {
        resolvedDependencies.applyWorkspaceCreateProgressEvent?.(payload);
      }) ?? (() => {});
    const unsubscribeWorkspaceCreateCompleted =
      resolvedDependencies.subscribeWorkspaceCreateCompleted?.((payload) => {
        resolvedDependencies.applyWorkspaceCreateCompletedEvent?.(payload);

        // Always reload the snapshot after completion so the desktop picks up
        // the authoritative API status (clears the provisioning spinner even
        // when the daemon PATCH event was dropped or arrived late).
        void resolvedDependencies.loadWorkspaceSnapshot?.().catch((error) => {
          console.error(
            "[backendEventStoreBindings] Failed to refresh workspace snapshot after create completion",
            error,
          );
        });
      }) ?? (() => {});
    const unsubscribeWorkspaceCreateFailed =
      resolvedDependencies.subscribeWorkspaceCreateFailed?.((payload) => {
        resolvedDependencies.applyWorkspaceCreateFailedEvent?.(payload);
      }) ?? (() => {});
    const unsubscribeWorkspacePullRequestUpdated =
      resolvedDependencies.subscribeWorkspacePullRequestUpdated?.((payload) => {
        resolvedDependencies.setWorkspacePullRequest?.(payload.workspaceId, payload.pullRequest);
      }) ?? (() => {});
    const unsubscribeWorkspaceSnapshotChanged =
      resolvedDependencies.subscribeWorkspaceSnapshotChanged?.((payload) => {
        const selectedOrganizationId = resolvedDependencies.getSelectedOrganizationId?.()?.trim();
        const payloadOrganizationId = payload.organizationId.trim();
        if (selectedOrganizationId && selectedOrganizationId !== payloadOrganizationId) {
          if (import.meta.env.DEV) {
            console.debug("[backendEventStoreBindings] workspace snapshot invalidation ignored due to org mismatch", {
              selectedOrganizationId,
              payloadOrganizationId,
              resource: payload.resource,
              change: payload.change,
              projectId: payload.projectId,
              workspaceId: payload.workspaceId,
            });
          }
          return;
        }

        // When the backend confirms a workspace was closed, skip the full reload
        // if that workspace is already absent from the local store. This avoids a
        // race where the snapshot refresh re-adds a workspace that was just
        // optimistically removed by the local close action.
        if (
          payload.change === "closed" &&
          payload.workspaceId &&
          !resolvedDependencies.workspaceExistsLocally?.(payload.workspaceId)
        ) {
          if (import.meta.env.DEV) {
            console.debug(
              "[backendEventStoreBindings] workspace snapshot reload skipped: workspace already closed locally",
              { workspaceId: payload.workspaceId },
            );
          }
          return;
        }

        if (import.meta.env.DEV) {
          console.debug("[backendEventStoreBindings] workspace snapshot invalidated", {
            organizationId: payload.organizationId,
            resource: payload.resource,
            change: payload.change,
            projectId: payload.projectId,
            workspaceId: payload.workspaceId,
          });
        }

        scheduleWorkspaceSnapshotRefresh();
      }) ?? (() => {});
    const unsubscribeWorkspaceStateChanged =
      resolvedDependencies.subscribeWorkspaceStateChanged?.((_payload) => {
        if (import.meta.env.DEV) {
          console.debug("[backendEventStoreBindings] workspace state changed", _payload);
        }
        void resolvedDependencies.loadWorkspaceSnapshot?.().catch((error) => {
          console.error("[backendEventStoreBindings] Failed to refresh workspace snapshot after state change", error);
        });
      }) ?? (() => {});

    return () => {
      unsubscribeGitChanged();
      unsubscribeDaemonConnectionStatus();
      unsubscribeWorkspaceFilesChanged();
      unsubscribeWorkspaceCreateStarted();
      unsubscribeWorkspaceCreateProgress();
      unsubscribeWorkspaceCreateCompleted();
      unsubscribeWorkspaceCreateFailed();
      unsubscribeWorkspacePullRequestUpdated();
      unsubscribeWorkspaceSnapshotChanged();
      unsubscribeWorkspaceStateChanged();
      if (workspaceSnapshotRefreshTimer) {
        clearTimeout(workspaceSnapshotRefreshTimer);
      }
      for (const timeoutId of gitRefreshTimersByWorktreePath.values()) {
        clearTimeout(timeoutId);
      }
      gitRefreshTimersByWorktreePath.clear();
    };
  };
}
