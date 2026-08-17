import { chatStore } from "./chatStore";

/**
 * Agent feature state actions — the public state-change surface for Agent
 * State (Phase 17, desktop6.md). Cross-feature code applies agent chat state
 * changes through these functions instead of importing the Agent Store
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
