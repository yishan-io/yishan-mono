import { removeTabData, removeWorkspaceTaskCounts } from "../../../features/agent/state/chatActions";
import { tabStore } from "../../../features/workbench/state/tabStore";
import { workbenchNavigationStore } from "../../../features/workbench/state/workbenchNavigationStore";
import type { WorkspaceItem } from "../../../features/workspace/model/workspaceTypes";
import { selectWorkspaces } from "../../../features/workspace/state/workspaceSelectors";

/** Reconciles tab/chat state after workspace list changes in workspace store. */
export function syncTabStoreWithWorkspace(previousWorkspaces: WorkspaceItem[]): void {
  const nextWorkspaceIds = selectWorkspaces().map((workspace) => workspace.id);
  const removedWorkspaceIds = previousWorkspaces
    .filter((workspace) => !nextWorkspaceIds.includes(workspace.id))
    .map((workspace) => workspace.id);

  const removedTabIds = tabStore.getState().retainWorkspaceTabs(nextWorkspaceIds);

  // Re-resolve the tab for the current workspace after the list changes.
  // workbenchNavigationStore is the single source of truth for which workspace
  // is active; tabStore only needs to know which tab to show for it.
  tabStore.getState().resolveTabForWorkspace(workbenchNavigationStore.getState().activeWorkspaceId);

  if (removedTabIds.length > 0) {
    removeTabData(removedTabIds);
  }
  if (removedWorkspaceIds.length > 0) {
    removeWorkspaceTaskCounts(removedWorkspaceIds);
  }
}
