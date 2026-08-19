import type { RpcFrontendMessageKey, RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
import { SUPPORTED_NOTIFICATION_EVENT_TYPES } from "../../shared/notifications/notificationPreferences";

/**
 * Backend-event schema guards (desktop8 Phase 33: split from
 * backendEventAdapter's normalization logic).
 */

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

export function isRpcFrontendMessageKey(value: string): value is RpcFrontendMessageKey {
  return FRONTEND_MESSAGE_KEY_SET.has(value);
}

/**
 * Returns true when a value is a non-null object record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

export function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

/**
 * Returns true when observer lifecycle metadata uses the expected runtime shape.
 */
export function isNotificationObserverStatusPayload(
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
export function isNotificationEventPayload(
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

export function isSupportedNotificationEventType(value: unknown): boolean {
  return typeof value === "string" && (SUPPORTED_NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

export function isOptionalNotificationEventType(value: unknown): boolean {
  return value === undefined || isSupportedNotificationEventType(value);
}

export function isOptionalNotificationObserverStatusPayload(value: unknown): boolean {
  return value === undefined || isNotificationObserverStatusPayload(value);
}

/** Returns true when one optional notification sound payload has the supported runtime shape. */
export function isNotificationSoundPayload(
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
