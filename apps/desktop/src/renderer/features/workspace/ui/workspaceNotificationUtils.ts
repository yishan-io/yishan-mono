import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";
import type { WorkspaceTab } from "../../../features/workbench/model/tabTypes";

export type InAppWorkspaceNotificationPayload = RpcFrontendMessagePayload<"notificationEvent">;

/**
 * Resolves the currently selected workspace session when one session tab is active.
 */
export function resolveFocusedWorkspaceSession(input: {
  selectedWorkspaceId: string;
  selectedTabId: string;
  tabs: WorkspaceTab[];
}): { workspaceId: string; sessionId: string } | null {
  const selectedWorkspaceId = input.selectedWorkspaceId.trim();
  if (!selectedWorkspaceId) {
    return null;
  }

  const selectedTab = input.tabs.find((tab) => tab.id === input.selectedTabId);
  if (!selectedTab || selectedTab.kind !== "session") {
    return null;
  }

  const sessionId = selectedTab.data.sessionId?.trim();
  if (!sessionId || selectedTab.workspaceId !== selectedWorkspaceId) {
    return null;
  }

  return {
    workspaceId: selectedWorkspaceId,
    sessionId,
  };
}

/**
 * Returns whether one in-app notification targets the currently focused workspace session tab.
 */
export function isNotificationForFocusedSession(input: {
  notification: InAppWorkspaceNotificationPayload;
  selectedWorkspaceId: string;
  selectedTabId: string;
  tabs: WorkspaceTab[];
}): boolean {
  const workspaceId = input.notification.workspaceId;
  const sessionId = input.notification.sessionId;
  if (!workspaceId || !sessionId) {
    return false;
  }

  const focusedSession = resolveFocusedWorkspaceSession({
    selectedWorkspaceId: input.selectedWorkspaceId,
    selectedTabId: input.selectedTabId,
    tabs: input.tabs,
  });
  if (!focusedSession) {
    return false;
  }

  return focusedSession.workspaceId === workspaceId && focusedSession.sessionId === sessionId;
}
