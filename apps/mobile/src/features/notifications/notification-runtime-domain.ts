import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import { workspaceSidebarLabel } from "@/features/shell/view-model/shell-labels";

import type { WorkspaceFrontendEventsMessage } from "@/features/workspaces/workspace-frontend-events";
import type { WorkspaceAgentStatus, WorkspaceUnreadTone } from "./notification-runtime-context";
import type {
  InAppNotificationBanner,
  NodeConnectionMeta,
  RuntimeLifecycleState,
  WorkspaceConnectionMeta,
} from "./notification-runtime-helpers";
import {
  deriveTerminalAgentStatusByTerminalId,
  deriveWorkspaceAgentStatusByWorkspaceId,
  formatNotificationContent,
  isNotificationPayload,
  parseNotificationTerminalId,
  resolveLifecycleStatus,
} from "./notification-runtime-helpers";
import type {
  FrontendNotificationEventPayload,
  NotificationEventType,
  NotificationPreferences,
} from "./notifications.types";

export function buildWorkspaceMetaById(
  projects: ProjectWithWorkspaces[],
  t: (key: string, params?: Record<string, string | number>) => string,
): Record<string, WorkspaceConnectionMeta> {
  return Object.fromEntries(
    projects.flatMap((project) =>
      project.workspaces.map(
        (workspace) =>
          [
            workspace.id,
            {
              nodeId: workspace.nodeId,
              orgId: project.organizationId,
              projectId: project.id,
              workspaceId: workspace.id,
              workspaceLabel: workspaceSidebarLabel(workspace, t),
            },
          ] as const,
      ),
    ),
  );
}

export function buildNodeConnectionMetas(
  workspaceMetaById: Record<string, WorkspaceConnectionMeta>,
): NodeConnectionMeta[] {
  const metaByNodeId = new Map<string, NodeConnectionMeta>();
  for (const workspace of Object.values(workspaceMetaById)) {
    if (!metaByNodeId.has(workspace.nodeId)) {
      const { workspaceLabel: _workspaceLabel, ...nodeMeta } = workspace;
      metaByNodeId.set(workspace.nodeId, nodeMeta);
    }
  }

  return [...metaByNodeId.values()];
}

export function clearWorkspaceUnreadTone(
  current: Record<string, WorkspaceUnreadTone>,
  workspaceId: string | null | undefined,
): Record<string, WorkspaceUnreadTone> {
  if (!workspaceId || !(workspaceId in current)) {
    return current;
  }

  const next = { ...current };
  delete next[workspaceId];
  return next;
}

export function createEmptyNotificationRuntimeValue() {
  return {
    terminalAgentStatusByTerminalId: {},
    workspaceAgentStatusByWorkspaceId: {},
    workspaceUnreadToneByWorkspaceId: {},
  };
}

export function shouldConnectNotificationStream(input: {
  accessToken: string | null | undefined;
  currentOrganizationId: string | null;
  nodeConnectionMetas: NodeConnectionMeta[];
  notificationPreferences: NotificationPreferences | undefined;
  status: "authenticated" | "loading" | "signed-out";
}): boolean {
  return (
    input.status === "authenticated" &&
    !!input.accessToken &&
    !!input.currentOrganizationId &&
    input.nodeConnectionMetas.length > 0 &&
    !!input.notificationPreferences?.enabled
  );
}

export function appendSeenNotificationId(currentIds: string[], nextId: string): string[] {
  if (currentIds.includes(nextId)) {
    return currentIds;
  }

  return [...currentIds.slice(-49), nextId];
}

export function isNotificationStreamMessage(
  message: WorkspaceFrontendEventsMessage,
): message is WorkspaceFrontendEventsMessage & {
  payload: FrontendNotificationEventPayload;
  topic: "notificationEvent";
  type: "event";
} {
  return message.type === "event" && message.topic === "notificationEvent" && isNotificationPayload(message.payload);
}

export function reduceLifecycleState(input: {
  lifecycleBySessionKey: Map<string, RuntimeLifecycleState>;
  node: NodeConnectionMeta;
  payload: FrontendNotificationEventPayload;
  targetWorkspaceId: string;
  terminalId: string | null;
}): null | {
  terminalAgentStatusByTerminalId: Record<string, WorkspaceAgentStatus>;
  workspaceAgentStatusByWorkspaceId: Record<string, WorkspaceAgentStatus>;
} {
  const observerStatus = input.payload.observerStatus;
  if (!observerStatus || typeof observerStatus.sessionKey !== "string") {
    return null;
  }

  const sessionKey = observerStatus.sessionKey.trim();
  if (sessionKey.length === 0) {
    return null;
  }

  const nextStatus = resolveLifecycleStatus(observerStatus.normalizedEventType);
  if (nextStatus === null) {
    input.lifecycleBySessionKey.delete(sessionKey);
  } else {
    input.lifecycleBySessionKey.set(sessionKey, {
      status: nextStatus,
      terminalId: input.terminalId,
      workspaceId: input.targetWorkspaceId,
    });
  }

  return {
    workspaceAgentStatusByWorkspaceId: deriveWorkspaceAgentStatusByWorkspaceId(input.lifecycleBySessionKey),
    terminalAgentStatusByTerminalId: deriveTerminalAgentStatusByTerminalId(input.lifecycleBySessionKey),
  };
}

export function deriveNextWorkspaceUnreadTones(
  current: Record<string, WorkspaceUnreadTone>,
  input: {
    activeWorkspaceId: string | null;
    payload: FrontendNotificationEventPayload;
    targetWorkspaceId: string;
  },
): Record<string, WorkspaceUnreadTone> {
  if (input.payload.silent === true || input.targetWorkspaceId === input.activeWorkspaceId) {
    return current;
  }

  const previousTone = current[input.targetWorkspaceId];
  const nextTone = previousTone === "error" ? "error" : input.payload.tone === "error" ? "error" : "success";
  if (previousTone === nextTone) {
    return current;
  }

  return {
    ...current,
    [input.targetWorkspaceId]: nextTone,
  };
}

export function shouldPresentNotificationEvent(
  payload: FrontendNotificationEventPayload,
  notificationPreferences: NotificationPreferences | undefined,
): payload is FrontendNotificationEventPayload & { notificationEventType: NotificationEventType } {
  const eventType = payload.notificationEventType;
  return (
    !!eventType &&
    !!notificationPreferences?.enabled &&
    notificationPreferences.enabledCategories.includes("ai-task") &&
    notificationPreferences.enabledEventTypes.includes(eventType)
  );
}

export function buildInAppNotificationBanner(input: {
  fallbackWorkspaceLabel: string;
  node: NodeConnectionMeta;
  payload: FrontendNotificationEventPayload & { notificationEventType: NotificationEventType };
  t: (key: string, params?: Record<string, string | number>) => string;
  targetWorkspaceId: string;
  terminalId: string | null;
  workspaceMetaById: Record<string, WorkspaceConnectionMeta>;
}): InAppNotificationBanner {
  const workspaceMeta = input.workspaceMetaById[input.targetWorkspaceId] ?? {
    nodeId: input.node.nodeId,
    orgId: input.node.orgId,
    projectId: input.node.projectId,
    workspaceId: input.node.workspaceId,
    workspaceLabel: input.fallbackWorkspaceLabel,
  };
  const content = formatNotificationContent({
    payload: input.payload,
    t: input.t,
    workspaceLabel: workspaceMeta.workspaceLabel,
  });

  return {
    body: content.body,
    orgId: workspaceMeta.orgId,
    projectId: workspaceMeta.projectId,
    terminalId: input.terminalId,
    title: content.title,
    workspaceId: workspaceMeta.workspaceId,
  };
}

export function readNotificationTarget(input: {
  node: NodeConnectionMeta;
  payload: FrontendNotificationEventPayload;
}) {
  return {
    targetWorkspaceId: input.payload.workspaceId ?? input.node.workspaceId,
    terminalId: parseNotificationTerminalId(input.payload),
  };
}
