import { chatStore } from "../../../features/agent/state/chatStore";
import { tabStore } from "../../../features/workbench/state/tabStore";
import type { WorkspaceItem } from "../../../features/workbench/model/types";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";

/** Reconciles tab/chat state after workspace list changes in workspace store. */
export function syncTabStoreWithWorkspace(previousWorkspaces: WorkspaceItem[]): void {
  const nextWorkspaceIds = workspaceStore.getState().workspaces.map((workspace) => workspace.id);
  const removedWorkspaceIds = previousWorkspaces
    .filter((workspace) => !nextWorkspaceIds.includes(workspace.id))
    .map((workspace) => workspace.id);

  const removedTabIds = tabStore.getState().retainWorkspaceTabs(nextWorkspaceIds);

  // Re-resolve the tab for the current workspace after the list changes.
  // workspaceStore is the single source of truth for which workspace is selected;
  // tabStore only needs to know which tab to show for it.
  tabStore.getState().resolveTabForWorkspace(workspaceStore.getState().selectedWorkspaceId);

  if (removedTabIds.length > 0) {
    chatStore.getState().removeTabData(removedTabIds);
  }
  if (removedWorkspaceIds.length > 0) {
    chatStore.getState().removeWorkspaceTaskCounts(removedWorkspaceIds);
  }
}
