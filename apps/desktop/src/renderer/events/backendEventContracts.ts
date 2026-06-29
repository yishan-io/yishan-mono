import type { DesktopRpcEventEnvelope } from "../../main/ipc";
import type { RpcFrontendMessageKey, RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
import { SUPPORTED_NOTIFICATION_EVENT_TYPES } from "../../shared/notifications/notificationPreferences";

const FRONTEND_MESSAGE_KEYS = [
  "appAction",
  "chatEvent",
  "notificationEvent",
  "gitChanged",
  "workspaceFilesChanged",
  "workspaceCreateStarted",
  "workspaceCreateProgress",
  "workspaceCreateCompleted",
  "workspaceCreateFailed",
  "workspacePullRequestUpdated",
  "workspaceSnapshotChanged",
  "openBrowserUrl",
  "terminalSessionChanged",
  "terminalAgentChanged",
  "agentPiEvent",
] as const satisfies readonly RpcFrontendMessageKey[];

const FRONTEND_MESSAGE_KEY_SET = new Set<string>(FRONTEND_MESSAGE_KEYS);

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
  | "agent.pi.event";

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
} as const satisfies Record<RpcFrontendMessageKey, BackendEventName>;

/**
 * Returns true when a raw RPC method string is one of the frontend message keys.
 */
function isRpcFrontendMessageKey(value: string): value is RpcFrontendMessageKey {
  return FRONTEND_MESSAGE_KEY_SET.has(value);
}

/**
 * Returns true when a value is a non-null object record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

/**
 * Returns true when observer lifecycle metadata uses the expected runtime shape.
 */
function isNotificationObserverStatusPayload(
  value: unknown,
): value is NonNullable<RpcFrontendMessagePayload<"notificationEvent">["observerStatus"]> {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.normalizedEventType !== "start" &&
    value.normalizedEventType !== "wait_input" &&
    value.normalizedEventType !== "stop" &&
    value.normalizedEventType !== "unknown"
  ) {
    return false;
  }

  return typeof value.sessionKey === "string";
}

/**
 * Returns true when one notification event payload satisfies the renderer runtime contract.
 */
function isNotificationEventPayload(
  payload: Record<string, unknown>,
): payload is RpcFrontendMessagePayload<"notificationEvent"> {
  const hasRequiredFields =
    typeof payload.id === "string" &&
    typeof payload.title === "string" &&
    (payload.tone === "success" || payload.tone === "error") &&
    typeof payload.createdAt === "string";
  if (!hasRequiredFields) {
    return false;
  }

  const optionalStringFields = [
    payload.body,
    payload.agent,
    payload.workspaceId,
    payload.workspaceName,
    payload.sessionId,
    payload.navigationPath,
  ];
  const hasValidOptionalFields =
    optionalStringFields.every(isOptionalString) &&
    isOptionalBoolean(payload.silent) &&
    isOptionalBoolean(payload.showSystemNotification) &&
    isOptionalNotificationEventType(payload.notificationEventType) &&
    isOptionalNotificationObserverStatusPayload(payload.observerStatus) &&
    isNotificationSoundPayload(payload.soundToPlay);
  if (!hasValidOptionalFields) {
    return false;
  }

  return true;
}

function isSupportedNotificationEventType(value: unknown): boolean {
  return typeof value === "string" && (SUPPORTED_NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

function isOptionalNotificationEventType(value: unknown): boolean {
  return value === undefined || isSupportedNotificationEventType(value);
}

function isOptionalNotificationObserverStatusPayload(value: unknown): boolean {
  return value === undefined || isNotificationObserverStatusPayload(value);
}

/** Returns true when one optional notification sound payload has the supported runtime shape. */
function isNotificationSoundPayload(
  value: unknown,
): value is NonNullable<RpcFrontendMessagePayload<"notificationEvent">["soundToPlay"]> {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.soundId !== "chime" &&
    value.soundId !== "ping" &&
    value.soundId !== "pop" &&
    value.soundId !== "zip" &&
    value.soundId !== "alert"
  ) {
    return false;
  }

  return typeof value.volume === "number" && Number.isFinite(value.volume) && value.volume >= 0;
}

/**
 * Normalizes and validates one backend IPC event envelope.
 *
 * Returns `null` when the method key is unknown or required payload fields are invalid.
 */
export function normalizeBackendEvent(envelope: DesktopRpcEventEnvelope): NormalizedBackendEvent | null {
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
    if (typeof payload.workspaceId !== "string" || typeof payload.worktreePath !== "string") {
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
      typeof payload.workspaceId !== "string"
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

  if (typeof payload.action !== "string") {
    return null;
  }

  return {
    source: "appAction",
    name: BACKEND_EVENT_NAME_BY_SOURCE.appAction,
    payload: payload as RpcFrontendMessagePayload<"appAction">,
  };
}
