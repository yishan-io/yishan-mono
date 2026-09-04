import { stopAgentSession, workspaceAgentIndicatorStore } from "@renderer/domains/agent";
import {
  resolveTabForWorkspace,
  retainWorkspaceTabs,
  tabStore,
  workbenchNavigationStore,
} from "@renderer/domains/workbench";
import { workspaceStore } from "../state/workspaceStore";
import type { WorkspaceItem } from "../workspaceTypes";

/** Reconciles tab/chat state after workspace list changes in workspace store. */
export async function syncTabStoreWithWorkspace(previousWorkspaces: WorkspaceItem[]): Promise<void> {
  // Lazy import: the agent index pulls the chat UI graph; loading it eagerly
  // re-enters the workspace index mid-eval in vite-node test graphs.
  const nextWorkspaceIds = workspaceStore.getState().workspaces.map((workspace) => workspace.id);
  const removedWorkspaceIds = previousWorkspaces
    .filter((workspace) => !nextWorkspaceIds.includes(workspace.id))
    .map((workspace) => workspace.id);

  const removedAgentChatTabs = tabStore
    .getState()
    .tabs.filter((tab) => removedWorkspaceIds.includes(tab.workspaceId) && tab.kind === "agent-chat");
  const agentStopPromises = removedAgentChatTabs.map((tab) => stopAgentSession(tab.id));
  // fire-and-forget: workspace removal must not wait for agent session cleanup.
  void Promise.allSettled(agentStopPromises);

  retainWorkspaceTabs(nextWorkspaceIds);

  // Re-resolve the tab for the current workspace after the list changes.
  // workbenchNavigationStore is the single source of truth for which workspace
  // is active; tabStore only needs to know which tab to show for it.
  resolveTabForWorkspace(workbenchNavigationStore.getState().activeWorkspaceId);

  if (removedWorkspaceIds.length > 0) {
    workspaceAgentIndicatorStore.getState().remove(removedWorkspaceIds);
  }
}
