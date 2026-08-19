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

import { incrementFileTreeRefreshVersion } from "@renderer/domains/files";
import { incrementGitRefreshVersion, setWorkspaceCurrentBranch, setWorkspacePullRequest } from "@renderer/domains/git";
import { inspectGitRepository } from "@renderer/domains/git";
import { openTab } from "@renderer/domains/workbench";

import { workspaceCreateProgressStore } from "../../../domains/workspace/state/workspaceCreateProgressStore";
import { enqueueWorkspaceErrorNotice } from "../../../domains/workspace/state/workspaceLifecycleNoticeStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { subscribeDaemonConnectionStatus } from "../infrastructure/daemonWorkspaceClient";
import { buildWorkspaceCreatePlaceholder } from "../workspaceCreatePlaceholder";
import { sessionStore } from "@renderer/domains/session";

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
  subscribeGitChanged?: (
    listener: (
      workspaceId: string | undefined,
      workspaceWorktreePath: string,
      affectsBranch: boolean,
      currentBranch?: string,
    ) => void,
  ) => () => void;
  subscribeWorkspaceFilesChanged?: (
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
 * Default dependencies: real store actions. The backend-event subscriptions
 * and the workspace-snapshot flow are App-composed: app/events/index.ts
 * passes them into createWorkspaceEventHandlers so Workspace never imports
 * app (Domains plan D8).
 */
export const DEFAULT_WORKSPACE_EVENT_DEPENDENCIES: WorkspaceEventDependencies = {
  subscribeDaemonConnectionStatus,

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
      setWorkspaceCurrentBranch(workspaceId, currentBranch);
      return;
    }
    try {
      const result = await inspectGitRepository({ workspaceId });
      setWorkspaceCurrentBranch(workspaceId, result.currentBranch ?? "");
    } catch {
      // Non-fatal: cache stays stale until the next gitChanged event.
    }
  },
  incrementFileTreeRefreshVersion: (workspaceWorktreePath, changedRelativePaths) => {
    incrementFileTreeRefreshVersion(workspaceWorktreePath, changedRelativePaths);
  },
  incrementGitRefreshVersion: (workspaceWorktreePath) => {
    incrementGitRefreshVersion(workspaceWorktreePath);
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
      openTab({
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
    setWorkspacePullRequest(workspaceId, pullRequest);
  },
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

    const unsubscribeGitChanged =
      resolvedDependencies.subscribeGitChanged?.((workspaceId, workspaceWorktreePath, affectsBranch, currentBranch) => {
        scheduleGitRefresh(workspaceWorktreePath);

        if (affectsBranch) {
          const resolvedId =
            workspaceId ?? resolvedDependencies.resolveWorkspaceIdByWorktreePath?.(workspaceWorktreePath);
          if (resolvedId) {
            void resolvedDependencies.refreshWorkspaceCurrentBranch?.(resolvedId, currentBranch);
          }
        }
      }) ?? (() => {});
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
    const unsubscribeWorkspaceFilesChanged =
      resolvedDependencies.subscribeWorkspaceFilesChanged?.(
        (_workspaceId, workspaceWorktreePath, changedRelativePaths) => {
          resolvedDependencies.incrementFileTreeRefreshVersion(workspaceWorktreePath, changedRelativePaths);
          scheduleGitRefresh(workspaceWorktreePath);
        },
      ) ?? (() => {});
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
