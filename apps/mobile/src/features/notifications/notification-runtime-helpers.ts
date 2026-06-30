import type { FrontendNotificationEventPayload } from "@/features/notifications/notifications.types";
import type {
  WorkspaceFrontendEventsConnection,
  WorkspaceFrontendEventsMessage,
} from "@/features/workspaces/workspace-frontend-events";

import type { WorkspaceAgentStatus, WorkspaceUnreadTone } from "./notification-runtime-context";

export type FrontendEventsWebSocketMessage = WorkspaceFrontendEventsMessage;

export type InAppNotificationBanner = {
  body: string;
  orgId: string;
  projectId: string;
  terminalId: string | null;
  title: string;
  workspaceId: string;
};

export type WorkspaceContext = {
  orgId: string;
  projectId: string;
  workspaceId: string;
};

export type WorkspaceConnectionMeta = WorkspaceContext & {
  nodeId: string;
  workspaceLabel: string;
};

export type RuntimeLifecycleState = {
  status: WorkspaceAgentStatus;
  terminalId: string | null;
  workspaceId: string;
};
export type NodeConnectionMeta = WorkspaceFrontendEventsConnection;

export function isNotificationPayload(value: Record<string, unknown>): value is FrontendNotificationEventPayload {
  return typeof value.id === "string" && typeof value.title === "string" && typeof value.createdAt === "string";
}

export function readStringData(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function toWorkspaceContext(value: {
  kind: string;
  orgId: string;
  projectId: string;
  workspaceId: string;
}): WorkspaceContext | null {
  if (
    (value.kind !== "workspace" && value.kind !== "terminal") ||
    !value.orgId ||
    !value.projectId ||
    !value.workspaceId
  ) {
    return null;
  }

  return {
    orgId: value.orgId,
    projectId: value.projectId,
    workspaceId: value.workspaceId,
  };
}

export function parseNotificationTerminalId(payload: FrontendNotificationEventPayload): string | null {
  const sessionKey = payload.observerStatus?.sessionKey;
  if (typeof sessionKey !== "string") {
    return null;
  }

  const [workspaceId, terminalId] = sessionKey.split(":", 3);
  if (!workspaceId || !terminalId || workspaceId !== payload.workspaceId) {
    return null;
  }

  return terminalId;
}

export function resolveLifecycleStatus(normalizedEventType: unknown): WorkspaceAgentStatus | null {
  if (normalizedEventType === "start") {
    return "running";
  }

  if (normalizedEventType === "wait_input") {
    return "waiting_input";
  }

  return null;
}

export function deriveWorkspaceAgentStatusByWorkspaceId(
  lifecycleBySessionKey: Map<string, RuntimeLifecycleState>,
): Record<string, WorkspaceAgentStatus> {
  const statusByWorkspaceId: Record<string, WorkspaceAgentStatus> = {};

  for (const lifecycle of lifecycleBySessionKey.values()) {
    if (lifecycle.status === "running") {
      statusByWorkspaceId[lifecycle.workspaceId] = "running";
      continue;
    }

    if (statusByWorkspaceId[lifecycle.workspaceId] !== "running") {
      statusByWorkspaceId[lifecycle.workspaceId] = "waiting_input";
    }
  }

  return statusByWorkspaceId;
}

export function deriveTerminalAgentStatusByTerminalId(
  lifecycleBySessionKey: Map<string, RuntimeLifecycleState>,
): Record<string, WorkspaceAgentStatus> {
  const statusByTerminalId: Record<string, WorkspaceAgentStatus> = {};

  for (const lifecycle of lifecycleBySessionKey.values()) {
    if (!lifecycle.terminalId) {
      continue;
    }

    if (lifecycle.status === "running") {
      statusByTerminalId[lifecycle.terminalId] = "running";
      continue;
    }

    if (statusByTerminalId[lifecycle.terminalId] !== "running") {
      statusByTerminalId[lifecycle.terminalId] = "waiting_input";
    }
  }

  return statusByTerminalId;
}

export function formatNotificationContent(input: {
  payload: FrontendNotificationEventPayload;
  t: (key: string, params?: Record<string, string | number>) => string;
  workspaceLabel: string;
}) {
  const { payload, t, workspaceLabel } = input;
  const body = payload.body ?? "";
  switch (payload.notificationEventType) {
    case "pending-question":
      return {
        body: t("settings.notificationPendingQuestionBody", { workspaceLabel }),
        title: t("settings.notificationPendingQuestionTitle"),
      };
    case "run-failed":
      return {
        body: t("settings.notificationRunFailedBody", { workspaceLabel }),
        title: t("settings.notificationRunFailedTitle"),
      };
    case "run-finished":
      return {
        body: t("settings.notificationRunFinishedBody", { workspaceLabel }),
        title: t("settings.notificationRunFinishedTitle"),
      };
    default:
      return {
        body:
          payload.workspaceId && body.includes(payload.workspaceId)
            ? body.replaceAll(payload.workspaceId, workspaceLabel)
            : body,
        title: payload.title,
      };
  }
}
