import { agentChatStore } from "../model/agentChatStore";
import type { AgentPendingUiAutoResponse } from "../model/agentChatTypes";
import { chatStore } from "./chatStore";

/**
 * Agent feature state actions — the public state-change surface for Agent
 * State (Phase 17, desktop6.md). Cross-feature code applies agent chat state
 * changes through these functions instead of importing the Agent Stores
 * directly. These are display-state cleanup actions without business effect;
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
