import type { RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
import type {
  NotificationEventType,
  NotificationPreferences,
} from "../../shared/notifications/notificationPreferences";
import {
  dispatchNotification,
  getNotificationPreferences,
  playNotificationSound,
} from "../commands/notificationCommands";
import { loadWorkspaceSnapshot } from "../commands/projectCommands";
import type { DesktopAgentKind } from "../helpers/agentSettings";
import { getDaemonClient } from "../rpc/rpcTransport";
import { subscribeDaemonConnectionStatus } from "../rpc/rpcTransport";
import { type WorkspaceAgentStatus, type WorkspaceUnreadTone, chatStore } from "../store/chatStore";
import { sessionStore } from "../store/sessionStore";
import { tabStore } from "../store/tabStore";
import { workspaceCreateProgressStore } from "../store/workspaceCreateProgressStore";
import { enqueueWorkspaceErrorNotice } from "../store/workspaceLifecycleNoticeStore";
import { workspaceStore } from "../store/workspaceStore";
import { subscribeBackendEvent } from "./backendEventPipeline";
import { subscribeInAppNotificationEvent } from "./backendEventSubscriptions";

type NotificationEventPayload = RpcFrontendMessagePayload<"notificationEvent">;
type ObserverStatusPayload = NonNullable<NotificationEventPayload["observerStatus"]>;
type NotificationSoundPayload = NonNullable<NotificationEventPayload["soundToPlay"]>;
type WorkspaceCreateProgressPayload = RpcFrontendMessagePayload<"workspaceCreateProgress">;
type WorkspaceCreateCompletedPayload = RpcFrontendMessagePayload<"workspaceCreateCompleted">;
type WorkspaceCreateFailedPayload = RpcFrontendMessagePayload<"workspaceCreateFailed">;
type WorkspacePullRequestUpdatedPayload = RpcFrontendMessagePayload<"workspacePullRequestUpdated">;
type WorkspaceSnapshotChangedPayload = RpcFrontendMessagePayload<"workspaceSnapshotChanged">;
type WorkspaceStateChangedPayload = RpcFrontendMessagePayload<"workspaceStateChanged">;
type AgentSessionLifecycleStatus = "running" | "waiting_input";

type BackendEventStoreBindingsDependencies = {
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
  subscribeInAppNotification: (listener: (payload: NotificationEventPayload) => void) => () => void;
  subscribeWorkspaceCreateProgress?: (listener: (payload: WorkspaceCreateProgressPayload) => void) => () => void;
  subscribeWorkspaceCreateCompleted?: (listener: (payload: WorkspaceCreateCompletedPayload) => void) => () => void;
  subscribeWorkspaceCreateFailed?: (listener: (payload: WorkspaceCreateFailedPayload) => void) => () => void;
  subscribeWorkspacePullRequestUpdated?: (
    listener: (payload: WorkspacePullRequestUpdatedPayload) => void,
  ) => () => void;
  subscribeWorkspaceSnapshotChanged?: (listener: (payload: WorkspaceSnapshotChangedPayload) => void) => () => void;
  subscribeWorkspaceStateChanged?: (listener: (payload: WorkspaceStateChangedPayload) => void) => () => void;
  subscribeOpenBrowserUrl?: (listener: (payload: { url: string; workspaceId: string }) => void) => () => void;
  subscribeTerminalSessionChanged?: (
    listener: (payload: {
      action: "created" | "destroyed";
      sessionId: string;
      workspaceId: string;
      tabId?: string;
      paneId?: string;
    }) => void,
  ) => () => void;
  listWorkspaceWorktreePaths?: () => string[];
  resolveWorkspaceIdByWorktreePath?: (worktreePath: string) => string | undefined;
  refreshWorkspaceCurrentBranch?: (workspaceId: string, currentBranch?: string) => Promise<void>;
  incrementFileTreeRefreshVersion: (workspaceWorktreePath?: string, changedRelativePaths?: string[]) => void;
  incrementGitRefreshVersion: (workspaceWorktreePath: string) => void;
  setWorkspaceAgentStatusByWorkspaceId: (statusByWorkspaceId: Record<string, WorkspaceAgentStatus>) => void;
  recordWorkspaceUnreadNotification: (workspaceId: string, tone: WorkspaceUnreadTone) => void;
  applyWorkspaceCreateProgressEvent?: (payload: WorkspaceCreateProgressPayload) => void;
  applyWorkspaceCreateCompletedEvent?: (payload: WorkspaceCreateCompletedPayload) => boolean;
  applyWorkspaceCreateFailedEvent?: (payload: WorkspaceCreateFailedPayload) => void;
  setWorkspacePullRequest?: (
    workspaceId: string,
    pullRequest: WorkspacePullRequestUpdatedPayload["pullRequest"],
  ) => void;
  loadWorkspaceSnapshot?: () => Promise<void>;
  getSelectedOrganizationId?: () => string | undefined;
  openBrowserTab?: (payload: { url: string; workspaceId: string }) => void;
  dispatchSystemNotification: (input: { title: string; body?: string }) => Promise<void>;
  playNotificationSound: (input: NotificationSoundPayload) => Promise<void>;
  getNotificationPreferences?: () => Promise<NotificationPreferences>;
  isRelevantTerminalFocused?: (payload: NotificationEventPayload) => boolean;
  resolveWorkspaceLabel?: (workspaceId: string) => string | undefined;
};

const GIT_REFRESH_COALESCE_MS = 2_000;

const DEFAULT_BACKEND_EVENT_STORE_BINDINGS_DEPENDENCIES: BackendEventStoreBindingsDependencies = {
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
  subscribeInAppNotification: (listener) => {
    return subscribeInAppNotificationEvent(listener);
  },
  subscribeWorkspaceCreateProgress: (listener) => {
    return subscribeBackendEvent("workspace.create.progress", (event) => {
      if (event.source !== "workspaceCreateProgress") {
        return;
      }

      listener(event.payload);
    });
  },
  subscribeWorkspaceCreateCompleted: (listener) => {
    return subscribeBackendEvent("workspace.create.completed", (event) => {
      if (event.source !== "workspaceCreateCompleted") {
        return;
      }

      listener(event.payload);
    });
  },
  subscribeWorkspaceCreateFailed: (listener) => {
    return subscribeBackendEvent("workspace.create.failed", (event) => {
      if (event.source !== "workspaceCreateFailed") {
        return;
      }

      listener(event.payload);
    });
  },
  subscribeWorkspacePullRequestUpdated: (listener) => {
    return subscribeBackendEvent("workspace.pull_request.updated", (event) => {
      if (event.source !== "workspacePullRequestUpdated") {
        return;
      }

      listener(event.payload);
    });
  },
  subscribeWorkspaceSnapshotChanged: (listener) => {
    return subscribeBackendEvent("workspace.snapshot.changed", (event) => {
      if (event.source !== "workspaceSnapshotChanged") {
        return;
      }

      listener(event.payload);
    });
  },
  subscribeWorkspaceStateChanged: (listener) => {
    return subscribeBackendEvent("workspace.state.changed", (event) => {
      if (event.source !== "workspaceStateChanged") {
        return;
      }

      listener(event.payload);
    });
  },
  subscribeOpenBrowserUrl: (listener) => {
    return subscribeBackendEvent("open.browser.url", (event) => {
      if (event.source !== "openBrowserUrl") {
        return;
      }

      listener(event.payload);
    });
  },
  subscribeTerminalSessionChanged: (listener) => {
    return subscribeBackendEvent("terminal.session.changed", (event) => {
      if (event.source !== "terminalSessionChanged") {
        return;
      }

      listener(event.payload);
    });
  },
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
    workspaceStore.getState().incrementFileTreeRefreshVersion(workspaceWorktreePath, changedRelativePaths);
  },
  incrementGitRefreshVersion: (workspaceWorktreePath) => {
    workspaceStore.getState().incrementGitRefreshVersion(workspaceWorktreePath);
  },
  setWorkspaceAgentStatusByWorkspaceId: (statusByWorkspaceId) => {
    chatStore.getState().setWorkspaceAgentStatusByWorkspaceId(statusByWorkspaceId);
  },
  recordWorkspaceUnreadNotification: (workspaceId, tone) => {
    chatStore.getState().recordWorkspaceUnreadNotification(workspaceId, tone);
  },
  applyWorkspaceCreateProgressEvent: (payload) => {
    workspaceCreateProgressStore.getState().applyWorkspaceCreateProgressEvent(payload);
  },
  applyWorkspaceCreateCompletedEvent: (payload) => {
    const store = workspaceStore.getState();
    const existing = store.workspaces.find((ws) => ws.id === payload.workspaceId);
    if (existing) {
      store.addWorkspace({
        workspaceId: payload.workspaceId,
        projectId: existing.projectId,
        repoId: existing.repoId,
        organizationId: existing.organizationId,
        name: existing.name,
        sourceBranch: existing.sourceBranch,
        branch: existing.branch,
        worktreePath: payload.worktreePath,
        nodeId: existing.nodeId,
      });
    }
    workspaceCreateProgressStore.getState().finishWorkspaceCreateProgress(payload.workspaceId);

    if (payload.taskRunSessionId && payload.taskRunAgentKind) {
      const title = payload.taskRunPrompt
        ? `Task: ${payload.taskRunPrompt.slice(0, 40)}`
        : `Task Run - ${payload.taskRunAgentKind}`;
      tabStore.getState().openTab({
        workspaceId: payload.workspaceId,
        kind: "terminal",
        title,
        sessionId: payload.taskRunSessionId,
        agentKind: payload.taskRunAgentKind as DesktopAgentKind,
        tabId: payload.taskRunTabId,
        paneId: payload.taskRunPaneId,
      });
    }

    return Boolean(existing);
  },
  applyWorkspaceCreateFailedEvent: (payload) => {
    workspaceCreateProgressStore.getState().finishWorkspaceCreateProgress(payload.workspaceId);
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
  openBrowserTab: (payload) => {
    tabStore.getState().openTab({ kind: "browser", workspaceId: payload.workspaceId, url: payload.url });
  },
  dispatchSystemNotification: async (input) => {
    await dispatchNotification(input);
  },
  playNotificationSound: async (input) => {
    await playNotificationSound(input);
  },
  getNotificationPreferences,
  isRelevantTerminalFocused: isRelevantTerminalFocusedForNotification,
  resolveWorkspaceLabel: (workspaceId) => {
    const state = workspaceStore.getState();
    const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
    const workspaceName = workspace?.name?.trim();
    if (!workspaceName) {
      return undefined;
    }

    const projectName = state.projects.find((project) => project.id === workspace?.projectId)?.name?.trim();
    return projectName ? `${projectName} / ${workspaceName}` : workspaceName;
  },
};

function resolveWorkspaceCopyLabel(
  payload: NotificationEventPayload,
  dependencies: BackendEventStoreBindingsDependencies,
): string | undefined {
  const workspaceId = payload.workspaceId?.trim();
  if (workspaceId) {
    const resolvedWorkspaceLabel = dependencies.resolveWorkspaceLabel?.(workspaceId)?.trim();
    if (resolvedWorkspaceLabel) {
      return resolvedWorkspaceLabel;
    }
  }

  const workspaceName = payload.workspaceName?.trim();
  return workspaceName || undefined;
}

function rewriteWorkspaceIdentifier(
  value: string | undefined,
  workspaceId: string | undefined,
  workspaceLabel: string | undefined,
): string | undefined {
  if (!value) {
    return value;
  }
  if (!workspaceId || !workspaceLabel || workspaceId === workspaceLabel) {
    return value;
  }

  return value.split(workspaceId).join(workspaceLabel);
}

function buildSystemNotificationCopy(
  payload: NotificationEventPayload,
  dependencies: BackendEventStoreBindingsDependencies,
): { title: string; body?: string } {
  const workspaceId = payload.workspaceId?.trim();
  const workspaceLabel = resolveWorkspaceCopyLabel(payload, dependencies);
  return {
    title: rewriteWorkspaceIdentifier(payload.title, workspaceId, workspaceLabel) ?? payload.title,
    body: rewriteWorkspaceIdentifier(payload.body, workspaceId, workspaceLabel),
  };
}

/**
 * Resolves one observer lifecycle status from notification observer metadata.
 */
function resolveLifecycleStatus(
  eventType: ObserverStatusPayload["normalizedEventType"],
): AgentSessionLifecycleStatus | null {
  if (eventType === "start") {
    return "running";
  }

  if (eventType === "wait_input") {
    return "waiting_input";
  }

  if (eventType === "stop") {
    return null;
  }

  return null;
}

/**
 * Aggregates session-level lifecycle states into one workspace-level status map.
 *
 * Priority per workspace is: `running` > `waiting_input` > absent (`idle`).
 */
function deriveWorkspaceAgentStatusByWorkspaceId(
  lifecycleBySessionKey: Map<
    string,
    {
      workspaceId: string;
      status: AgentSessionLifecycleStatus;
    }
  >,
): Record<string, WorkspaceAgentStatus> {
  const statusByWorkspaceId: Record<string, WorkspaceAgentStatus> = {};

  for (const lifecycle of lifecycleBySessionKey.values()) {
    const previousStatus = statusByWorkspaceId[lifecycle.workspaceId];
    if (lifecycle.status === "running") {
      statusByWorkspaceId[lifecycle.workspaceId] = "running";
      continue;
    }

    if (previousStatus !== "running") {
      statusByWorkspaceId[lifecycle.workspaceId] = "waiting_input";
    }
  }

  return statusByWorkspaceId;
}

function shouldDeliverPreferenceBackedNotification(
  preferences: NotificationPreferences,
  eventType: NotificationEventType,
): boolean {
  return (
    preferences.enabled &&
    preferences.enabledCategories.includes("ai-task") &&
    preferences.enabledEventTypes.includes(eventType)
  );
}

function parseObserverSessionKey(sessionKey: string): { workspaceId: string; tabId: string; paneId: string } | null {
  const [workspaceId, tabId, paneId] = sessionKey.split(":");
  if (!workspaceId || !tabId || !paneId) {
    return null;
  }

  return { workspaceId, tabId, paneId };
}

function isRelevantTerminalFocusedForNotification(payload: NotificationEventPayload): boolean {
  if (typeof document === "undefined" || !document.hasFocus()) {
    return false;
  }

  const observerStatus = payload.observerStatus;
  if (!observerStatus) {
    return false;
  }

  const sessionParts = parseObserverSessionKey(observerStatus.sessionKey.trim());
  if (!sessionParts) {
    return false;
  }

  const state = tabStore.getState();
  if (
    workspaceStore.getState().selectedWorkspaceId !== sessionParts.workspaceId ||
    state.selectedTabId !== sessionParts.tabId
  ) {
    return false;
  }

  return state.tabs.some((tab) => tab.id === sessionParts.tabId && tab.kind === "terminal");
}

function isNormalAgentCliExit(payload: NotificationEventPayload): boolean {
  return (
    payload.agent?.trim().toLowerCase() === "agent-cli" &&
    payload.observerStatus?.normalizedEventType === "stop" &&
    payload.tone === "success" &&
    payload.notificationEventType === "run-finished"
  );
}

function shouldSuppressNotificationEffects(
  payload: NotificationEventPayload,
  dependencies: BackendEventStoreBindingsDependencies,
): boolean {
  return isNormalAgentCliExit(payload) || (dependencies.isRelevantTerminalFocused?.(payload) ?? false);
}

async function dispatchPreferenceBackedNotification(
  payload: NotificationEventPayload,
  dependencies: BackendEventStoreBindingsDependencies,
) {
  const eventType = payload.notificationEventType;
  if (!eventType || payload.silent === true) {
    return;
  }

  if (shouldSuppressNotificationEffects(payload, dependencies)) {
    return;
  }

  const preferences = await (dependencies.getNotificationPreferences ?? getNotificationPreferences)();
  if (!shouldDeliverPreferenceBackedNotification(preferences, eventType)) {
    return;
  }

  const notificationCopy = buildSystemNotificationCopy(payload, dependencies);

  if (preferences.osEnabled) {
    await dependencies.dispatchSystemNotification(notificationCopy);
  }

  if (preferences.soundEnabled && preferences.volume > 0) {
    await dependencies.playNotificationSound({
      soundId: preferences.eventSounds[eventType],
      volume: preferences.volume,
    });
  }
}

/**
 * Creates one binding function that connects normalized backend events to workspace store actions.
 */
export function createBackendEventStoreBindings(
  dependencies: BackendEventStoreBindingsDependencies = DEFAULT_BACKEND_EVENT_STORE_BINDINGS_DEPENDENCIES,
) {
  const resolvedDependencies = {
    ...DEFAULT_BACKEND_EVENT_STORE_BINDINGS_DEPENDENCIES,
    ...dependencies,
  } satisfies BackendEventStoreBindingsDependencies;

  /**
   * Starts backend event listeners that mutate renderer store state and returns one teardown function.
   */
  return function startBackendEventStoreBindings() {
    const gitRefreshTimersByWorktreePath = new Map<string, ReturnType<typeof setTimeout>>();
    let workspaceSnapshotRefreshTimer: ReturnType<typeof setTimeout> | undefined;

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
        dependencies.incrementGitRefreshVersion(normalizedPath);
      }, GIT_REFRESH_COALESCE_MS);
      gitRefreshTimersByWorktreePath.set(normalizedPath, timeoutId);
    };

    const lifecycleBySessionKey = new Map<
      string,
      {
        workspaceId: string;
        status: AgentSessionLifecycleStatus;
      }
    >();

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
      resolvedDependencies.subscribeDaemonConnectionStatus ?? subscribeDaemonConnectionStatus
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
    const unsubscribeInAppNotification = resolvedDependencies.subscribeInAppNotification((payload) => {
      const workspaceId = payload.workspaceId?.trim();

      const observerStatus = payload.observerStatus;
      if (observerStatus && workspaceId) {
        const sessionKey = observerStatus.sessionKey.trim();
        if (sessionKey.length > 0) {
          const nextStatus = resolveLifecycleStatus(observerStatus.normalizedEventType);

          if (nextStatus === null) {
            lifecycleBySessionKey.delete(sessionKey);
          } else {
            lifecycleBySessionKey.set(sessionKey, {
              workspaceId,
              status: nextStatus,
            });
          }

          resolvedDependencies.setWorkspaceAgentStatusByWorkspaceId(
            deriveWorkspaceAgentStatusByWorkspaceId(lifecycleBySessionKey),
          );
        }
      }

      const suppressNotificationEffects = shouldSuppressNotificationEffects(payload, resolvedDependencies);

      if (payload.notificationEventType) {
        void dispatchPreferenceBackedNotification(payload, resolvedDependencies).catch(() => {
          // Preference resolution and delivery failures should not block store state updates.
        });
      } else if (payload.showSystemNotification && !suppressNotificationEffects) {
        const notificationCopy = buildSystemNotificationCopy(payload, resolvedDependencies);
        void resolvedDependencies.dispatchSystemNotification(notificationCopy).catch(() => {
          // Notification delivery failures should not block store state updates.
        });
      }

      if (payload.soundToPlay && !suppressNotificationEffects) {
        void resolvedDependencies.playNotificationSound(payload.soundToPlay).catch(() => {
          // Sound playback failures should not block store state updates.
        });
      }

      if (payload.silent === true || !workspaceId) {
        return;
      }

      const tone: WorkspaceUnreadTone = payload.tone === "error" ? "error" : "success";
      resolvedDependencies.recordWorkspaceUnreadNotification(workspaceId, tone);
    });
    const unsubscribeWorkspaceCreateProgress =
      resolvedDependencies.subscribeWorkspaceCreateProgress?.((payload) => {
        resolvedDependencies.applyWorkspaceCreateProgressEvent?.(payload);
      }) ?? (() => {});
    const unsubscribeWorkspaceCreateCompleted =
      resolvedDependencies.subscribeWorkspaceCreateCompleted?.((payload) => {
        const wasApplied = resolvedDependencies.applyWorkspaceCreateCompletedEvent?.(payload) ?? true;
        if (wasApplied) {
          return;
        }

        // The completion payload does not include enough fields to safely rebuild
        // a missing workspace row from scratch, so repair via an immediate reload.
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
          !workspaceStore.getState().workspaces.some((w) => w.id === payload.workspaceId)
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

        if (workspaceSnapshotRefreshTimer) {
          return;
        }

        workspaceSnapshotRefreshTimer = setTimeout(() => {
          workspaceSnapshotRefreshTimer = undefined;
          void resolvedDependencies.loadWorkspaceSnapshot?.().catch((error) => {
            console.error("[backendEventStoreBindings] Failed to refresh workspace snapshot after invalidation", error);
          });
        }, 300);
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
    const unsubscribeOpenBrowserUrl =
      resolvedDependencies.subscribeOpenBrowserUrl?.((payload) => {
        resolvedDependencies.openBrowserTab?.(payload);
      }) ?? (() => {});
    const unsubscribeTerminalSessionChanged =
      resolvedDependencies.subscribeTerminalSessionChanged?.((payload) => {
        handleTerminalSessionEvent(payload);
      }) ?? (() => {});

    return () => {
      unsubscribeGitChanged();
      unsubscribeDaemonConnectionStatus();
      unsubscribeWorkspaceFilesChanged();
      unsubscribeInAppNotification();
      unsubscribeWorkspaceCreateProgress();
      unsubscribeWorkspaceCreateCompleted();
      unsubscribeWorkspaceCreateFailed();
      unsubscribeWorkspacePullRequestUpdated();
      unsubscribeWorkspaceSnapshotChanged();
      unsubscribeWorkspaceStateChanged();
      unsubscribeOpenBrowserUrl();
      unsubscribeTerminalSessionChanged();
      if (workspaceSnapshotRefreshTimer) {
        clearTimeout(workspaceSnapshotRefreshTimer);
      }
      for (const timeoutId of gitRefreshTimersByWorktreePath.values()) {
        clearTimeout(timeoutId);
      }
      gitRefreshTimersByWorktreePath.clear();
      lifecycleBySessionKey.clear();
    };
  };
}

function handleTerminalSessionEvent(payload: {
  action: "created" | "destroyed";
  sessionId: string;
  workspaceId: string;
  tabId?: string;
  paneId?: string;
}): void {
  const tabState = tabStore.getState();

  if (payload.action === "created") {
    const existingTerminalTab = tabState.tabs.find(
      (tab) => tab.kind === "terminal" && tab.data.sessionId === payload.sessionId,
    );
    if (existingTerminalTab) {
      return;
    }

    const requestedTabId = payload.tabId?.trim();
    if (requestedTabId) {
      const requestedTerminalTab = tabState.tabs.find(
        (tab) =>
          tab.id === requestedTabId &&
          tab.workspaceId === payload.workspaceId &&
          tab.kind === "terminal" &&
          !tab.data.sessionId,
      );
      if (requestedTerminalTab) {
        tabState.setTerminalTabSessionId(requestedTabId, payload.sessionId);
        return;
      }
    }

    const workspaces = workspaceStore.getState().workspaces;
    if (!workspaces.some((workspace) => workspace.id === payload.workspaceId)) {
      return;
    }

    tabState.openTab({
      workspaceId: payload.workspaceId,
      kind: "terminal",
      title: "Terminal",
      sessionId: payload.sessionId,
    });
    return;
  }

  const matchingTab = tabState.tabs.find((tab) => tab.kind === "terminal" && tab.data.sessionId === payload.sessionId);
  if (matchingTab) {
    tabState.closeTab(matchingTab.id);
  }
}

/**
 * Starts shared bindings from normalized backend events into renderer stores.
 */
export const startBackendEventStoreBindings = createBackendEventStoreBindings();
