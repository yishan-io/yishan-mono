import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";
import type { WorkbenchTab } from "../../../domains/workbench/model/tabTypes";

export type InAppWorkspaceNotificationPayload = RpcFrontendMessagePayload<"notificationEvent">;

/**
 * Resolves the currently selected workspace session when one agent-chat tab is active.
 */
export function resolveFocusedWorkspaceSession(input: {
  selectedWorkspaceId: string;
  selectedTabId: string;
  tabs: WorkbenchTab[];
}): { workspaceId: string; sessionId: string } | null {
  const selectedWorkspaceId = input.selectedWorkspaceId.trim();
  if (!selectedWorkspaceId) {
    return null;
  }

  const selectedTab = input.tabs.find((tab) => tab.id === input.selectedTabId);
  if (!selectedTab || selectedTab.kind !== "agent-chat") {
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
  tabs: WorkbenchTab[];
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
