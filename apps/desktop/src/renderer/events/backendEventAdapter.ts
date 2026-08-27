import type { DesktopEventEnvelope } from "../../shared/contracts/desktopEventEnvelope";
import type { RpcFrontendMessageKey, RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
import {
  isNotificationEventPayload,
  isNotificationObserverStatusPayload,
  isNotificationSoundPayload,
  isOptionalBoolean,
  isOptionalNotificationEventType,
  isOptionalNotificationObserverStatusPayload,
  isOptionalString,
  isOptionalWorkspaceCreateTaskRunStatus,
  isRecord,
  isRpcFrontendMessageKey,
  isSupportedNotificationEventType,
  isWorkspaceCreateTaskRunMetadata,
} from "./backendEventGuards";

export type BackendEventName =
  | "app.action"
  | "chat.event"
  | "notification.event"
  | "git.changed"
  | "workspace.files.changed"
  | "workspace.create.started"
  | "workspace.create.progress"
  | "workspace.create.completed"
  | "workspace.create.failed"
  | "workspace.pull_request.updated"
  | "workspace.snapshot.changed"
  | "workspace.state.changed"
  | "open.browser.url"
  | "terminal.session.changed"
  | "terminal.agent.changed"
  | "agent.pi.event"
  | "localTask.changed";

export type NormalizedBackendEvent =
  | {
      source: "appAction";
      name: "app.action";
      payload: RpcFrontendMessagePayload<"appAction">;
    }
  | {
      source: "chatEvent";
      name: "chat.event";
      payload: RpcFrontendMessagePayload<"chatEvent">;
    }
  | {
      source: "notificationEvent";
      name: "notification.event";
      payload: RpcFrontendMessagePayload<"notificationEvent">;
    }
  | {
      source: "gitChanged";
      name: "git.changed";
      payload: RpcFrontendMessagePayload<"gitChanged">;
    }
  | {
      source: "workspaceFilesChanged";
      name: "workspace.files.changed";
      payload: RpcFrontendMessagePayload<"workspaceFilesChanged">;
    }
  | {
      source: "workspaceCreateStarted";
      name: "workspace.create.started";
      payload: RpcFrontendMessagePayload<"workspaceCreateStarted">;
    }
  | {
      source: "workspaceCreateProgress";
      name: "workspace.create.progress";
      payload: RpcFrontendMessagePayload<"workspaceCreateProgress">;
    }
  | {
      source: "workspaceCreateCompleted";
      name: "workspace.create.completed";
      payload: RpcFrontendMessagePayload<"workspaceCreateCompleted">;
    }
  | {
      source: "workspaceCreateFailed";
      name: "workspace.create.failed";
      payload: RpcFrontendMessagePayload<"workspaceCreateFailed">;
    }
  | {
      source: "workspacePullRequestUpdated";
      name: "workspace.pull_request.updated";
      payload: RpcFrontendMessagePayload<"workspacePullRequestUpdated">;
    }
  | {
      source: "workspaceSnapshotChanged";
      name: "workspace.snapshot.changed";
      payload: RpcFrontendMessagePayload<"workspaceSnapshotChanged">;
    }
  | {
      source: "openBrowserUrl";
      name: "open.browser.url";
      payload: RpcFrontendMessagePayload<"openBrowserUrl">;
    }
  | {
      source: "workspaceStateChanged";
      name: "workspace.state.changed";
      payload: RpcFrontendMessagePayload<"workspaceStateChanged">;
    }
  | {
      source: "terminalSessionChanged";
      name: "terminal.session.changed";
      payload: RpcFrontendMessagePayload<"terminalSessionChanged">;
    }
  | {
      source: "terminalAgentChanged";
      name: "terminal.agent.changed";
      payload: RpcFrontendMessagePayload<"terminalAgentChanged">;
    }
  | {
      source: "agentPiEvent";
      name: "agent.pi.event";
      payload: RpcFrontendMessagePayload<"agentPiEvent">;
    }
  | {
      source: "localTaskChanged";
      name: "localTask.changed";
      payload: RpcFrontendMessagePayload<"localTaskChanged">;
    };

/**
 * Maps backend RPC method keys to normalized event names used by the renderer event pipeline.
 */
export const BACKEND_EVENT_NAME_BY_SOURCE = {
  appAction: "app.action",
  chatEvent: "chat.event",
  notificationEvent: "notification.event",
  gitChanged: "git.changed",
  workspaceFilesChanged: "workspace.files.changed",
  workspaceCreateStarted: "workspace.create.started",
  workspaceCreateProgress: "workspace.create.progress",
  workspaceCreateCompleted: "workspace.create.completed",
  workspaceCreateFailed: "workspace.create.failed",
  workspacePullRequestUpdated: "workspace.pull_request.updated",
  workspaceSnapshotChanged: "workspace.snapshot.changed",
  workspaceStateChanged: "workspace.state.changed",
  openBrowserUrl: "open.browser.url",
  terminalSessionChanged: "terminal.session.changed",
  terminalAgentChanged: "terminal.agent.changed",
  agentPiEvent: "agent.pi.event",
  localTaskChanged: "localTask.changed",
} as const satisfies Record<RpcFrontendMessageKey, BackendEventName>;

/**
 * Returns true when a raw RPC method string is one of the frontend message keys.
 */
export function normalizeBackendEvent(envelope: DesktopEventEnvelope): NormalizedBackendEvent | null {
  if (!isRpcFrontendMessageKey(envelope.method)) {
    return null;
  }

  const payload = envelope.payload;
  if (!isRecord(payload)) {
    return null;
  }

  if (envelope.method === "chatEvent") {
    if (
      typeof payload.workspaceId !== "string" ||
      typeof payload.sessionId !== "string" ||
      !isRecord(payload.event) ||
      typeof payload.event.type !== "string"
    ) {
      return null;
    }

    return {
      source: "chatEvent",
      name: BACKEND_EVENT_NAME_BY_SOURCE.chatEvent,
      payload: payload as RpcFrontendMessagePayload<"chatEvent">,
    };
  }

  if (envelope.method === "notificationEvent") {
    if (!isNotificationEventPayload(payload)) {
      return null;
    }

    return {
      source: "notificationEvent",
      name: BACKEND_EVENT_NAME_BY_SOURCE.notificationEvent,
      payload: payload as RpcFrontendMessagePayload<"notificationEvent">,
    };
  }

  if (envelope.method === "gitChanged") {
    if (typeof payload.workspaceWorktreePath !== "string") {
      return null;
    }

    return {
      source: "gitChanged",
      name: BACKEND_EVENT_NAME_BY_SOURCE.gitChanged,
      payload: payload as RpcFrontendMessagePayload<"gitChanged">,
    };
  }

  if (envelope.method === "workspaceFilesChanged") {
    const changedRelativePaths = payload.changedRelativePaths;
    const hasValidChangedRelativePaths =
      changedRelativePaths === undefined ||
      (Array.isArray(changedRelativePaths) && changedRelativePaths.every((path) => typeof path === "string"));
    if (typeof payload.workspaceWorktreePath !== "string" || !hasValidChangedRelativePaths) {
      return null;
    }

    return {
      source: "workspaceFilesChanged",
      name: BACKEND_EVENT_NAME_BY_SOURCE.workspaceFilesChanged,
      payload: payload as RpcFrontendMessagePayload<"workspaceFilesChanged">,
    };
  }

  if (envelope.method === "workspaceCreateProgress") {
    if (
      typeof payload.workspaceId !== "string" ||
      typeof payload.stepId !== "string" ||
      typeof payload.label !== "string" ||
      typeof payload.createdAt !== "string" ||
      (payload.status !== "pending" &&
        payload.status !== "running" &&
        payload.status !== "completed" &&
        payload.status !== "failed" &&
        payload.status !== "skipped" &&
        payload.status !== "warning") ||
      !isOptionalString(payload.message)
    ) {
      return null;
    }

    return {
      source: "workspaceCreateProgress",
      name: BACKEND_EVENT_NAME_BY_SOURCE.workspaceCreateProgress,
      payload: payload as RpcFrontendMessagePayload<"workspaceCreateProgress">,
    };
  }

  if (envelope.method === "workspaceCreateStarted") {
    if (
      typeof payload.workspaceId !== "string" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.projectId !== "string" ||
      typeof payload.workspaceName !== "string" ||
      typeof payload.sourceBranch !== "string" ||
      typeof payload.branch !== "string" ||
      !isOptionalString(payload.nodeId)
    ) {
      return null;
    }

    return {
      source: "workspaceCreateStarted",
      name: BACKEND_EVENT_NAME_BY_SOURCE.workspaceCreateStarted,
      payload: payload as RpcFrontendMessagePayload<"workspaceCreateStarted">,
    };
  }

  if (envelope.method === "workspaceCreateCompleted") {
    if (
      typeof payload.workspaceId !== "string" ||
      typeof payload.worktreePath !== "string" ||
      !isOptionalWorkspaceCreateTaskRunStatus(payload.taskRunStatus) ||
      !isWorkspaceCreateTaskRunMetadata(payload)
    ) {
      return null;
    }

    return {
      source: "workspaceCreateCompleted",
      name: BACKEND_EVENT_NAME_BY_SOURCE.workspaceCreateCompleted,
      payload: payload as RpcFrontendMessagePayload<"workspaceCreateCompleted">,
    };
  }

  if (envelope.method === "workspaceCreateFailed") {
    if (typeof payload.workspaceId !== "string" || typeof payload.message !== "string") {
      return null;
    }

    return {
      source: "workspaceCreateFailed",
      name: BACKEND_EVENT_NAME_BY_SOURCE.workspaceCreateFailed,
      payload: payload as RpcFrontendMessagePayload<"workspaceCreateFailed">,
    };
  }

  if (envelope.method === "workspacePullRequestUpdated") {
    if (typeof payload.workspaceId !== "string" || typeof payload.workspaceWorktreePath !== "string") {
      return null;
    }

    return {
      source: "workspacePullRequestUpdated",
      name: BACKEND_EVENT_NAME_BY_SOURCE.workspacePullRequestUpdated,
      payload: payload as RpcFrontendMessagePayload<"workspacePullRequestUpdated">,
    };
  }

  if (envelope.method === "workspaceSnapshotChanged") {
    if (
      typeof payload.organizationId !== "string" ||
      (payload.resource !== "project" && payload.resource !== "workspace") ||
      (payload.change !== "created" &&
        payload.change !== "updated" &&
        payload.change !== "deleted" &&
        payload.change !== "closed") ||
      !isOptionalString(payload.projectId) ||
      !isOptionalString(payload.workspaceId)
    ) {
      return null;
    }

    return {
      source: "workspaceSnapshotChanged",
      name: BACKEND_EVENT_NAME_BY_SOURCE.workspaceSnapshotChanged,
      payload: payload as RpcFrontendMessagePayload<"workspaceSnapshotChanged">,
    };
  }

  if (envelope.method === "openBrowserUrl") {
    if (
      typeof payload.url !== "string" ||
      typeof payload.workspaceId !== "string" ||
      typeof payload.tabId !== "string" ||
      typeof payload.paneId !== "string"
    ) {
      return null;
    }

    return {
      source: "openBrowserUrl",
      name: BACKEND_EVENT_NAME_BY_SOURCE.openBrowserUrl,
      payload: payload as RpcFrontendMessagePayload<"openBrowserUrl">,
    };
  }

  if (envelope.method === "terminalSessionChanged") {
    if (
      (payload.action !== "created" && payload.action !== "destroyed") ||
      typeof payload.sessionId !== "string" ||
      typeof payload.workspaceId !== "string" ||
      typeof payload.pid !== "number" ||
      typeof payload.status !== "string" ||
      !isOptionalString(payload.tabId) ||
      !isOptionalString(payload.paneId) ||
      !isOptionalString(payload.title) ||
      !isOptionalString(payload.agentKind) ||
      !isOptionalString(payload.startedAt)
    ) {
      return null;
    }

    return {
      source: "terminalSessionChanged",
      name: BACKEND_EVENT_NAME_BY_SOURCE.terminalSessionChanged,
      payload: payload as RpcFrontendMessagePayload<"terminalSessionChanged">,
    };
  }

  if (envelope.method === "terminalAgentChanged") {
    if (typeof payload.tabId !== "string") {
      return null;
    }

    return {
      source: "terminalAgentChanged",
      name: BACKEND_EVENT_NAME_BY_SOURCE.terminalAgentChanged,
      payload: payload as RpcFrontendMessagePayload<"terminalAgentChanged">,
    };
  }

  if (envelope.method === "agentPiEvent") {
    if (
      typeof payload.sessionId !== "string" ||
      typeof payload.tabId !== "string" ||
      typeof payload.workspaceId !== "string" ||
      !isRecord(payload.event)
    ) {
      return null;
    }

    return {
      source: "agentPiEvent",
      name: BACKEND_EVENT_NAME_BY_SOURCE.agentPiEvent,
      payload: payload as RpcFrontendMessagePayload<"agentPiEvent">,
    };
  }

  if (envelope.method === "localTaskChanged") {
    return {
      source: "localTaskChanged",
      name: BACKEND_EVENT_NAME_BY_SOURCE.localTaskChanged,
      payload: payload as RpcFrontendMessagePayload<"localTaskChanged">,
    };
  }

  if (typeof payload.action !== "string") {
    return null;
  }

  return {
    source: "appAction",
    name: BACKEND_EVENT_NAME_BY_SOURCE.appAction,
    payload: payload as RpcFrontendMessagePayload<"appAction">,
  };
}
