import type { AgentPendingUiAutoResponse } from "../agentChatTypes";
import { agentChatStore } from "../state/agentChatStore";
import type { WorkspaceAgentStatus, WorkspaceUnreadTone } from "./chatStore";
import { chatStore } from "./chatStore";

/**
 * Agent chat semantic State mutations (desktop8 Phase 33). Each function is
 * the authoritative public State operation for Agent chat display state;
 * business-level agent operations live in Agent Commands.
 */

/** Removes agent-chat tab data for tabs that the Workbench closed. */
export function removeTabData(tabIds: string[]): void {
  chatStore.getState().removeTabData(tabIds);
}

/** Removes cached agent task counts for workspaces that no longer exist. */
export function removeWorkspaceTaskCounts(workspaceIds: string[]): void {
  chatStore.getState().removeWorkspaceTaskCounts(workspaceIds);
}

/** Marks one workspace's agent notifications as read. */
export function markWorkspaceNotificationsRead(workspaceId: string): void {
  chatStore.getState().markWorkspaceNotificationsRead(workspaceId);
}

/** Registers one pending UI auto-response for an agent session. */
export function setPendingUiAutoResponse(tabId: string, response: AgentPendingUiAutoResponse): void {
  agentChatStore.getState().setPendingUiAutoResponse(tabId, response);
}

/** Clears the pending UI auto-response for an agent session. */
export function clearPendingUiAutoResponse(tabId: string): void {
  agentChatStore.getState().clearPendingUiAutoResponse(tabId);
}

/** Records one turn error on an agent session. */
export function setTurnError(tabId: string, error: string): void {
  agentChatStore.getState().setTurnError(tabId, error);
}

/** Replaces the agent status snapshot by workspace id. */
export function setWorkspaceAgentStatusByWorkspaceId(statusByWorkspaceId: Record<string, WorkspaceAgentStatus>): void {
  chatStore.getState().setWorkspaceAgentStatusByWorkspaceId(statusByWorkspaceId);
}

/** Records one unread agent notification tone for a workspace. */
export function recordWorkspaceUnreadNotification(workspaceId: string, tone: WorkspaceUnreadTone): void {
  chatStore.getState().recordWorkspaceUnreadNotification(workspaceId, tone);
}

import type { DesktopAgentKind } from "../agentSettings";
import { agentSettingsStore } from "./agentSettingsStore";

/** Sets one desktop agent's in-use flag (Agent enablement State mutation). */
export function setAgentInUse(agentKind: DesktopAgentKind, inUse: boolean): void {
  agentSettingsStore.getState().setAgentInUse(agentKind, inUse);
}
