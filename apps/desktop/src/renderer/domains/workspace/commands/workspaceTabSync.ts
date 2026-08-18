import { resolveTabForWorkspace, retainWorkspaceTabs, workbenchNavigationStore } from "@renderer/domains/workbench";
import type { WorkspaceItem } from "../model/workspaceTypes";
import { selectWorkspaces } from "../state/workspaceSelectors";

/** Reconciles tab/chat state after workspace list changes in workspace store. */
export async function syncTabStoreWithWorkspace(previousWorkspaces: WorkspaceItem[]): Promise<void> {
  // Lazy import: the agent index pulls the chat UI graph; loading it eagerly
  // re-enters the workspace index mid-eval in vite-node test graphs.
  const { removeTabData, removeWorkspaceTaskCounts } = await import("@renderer/domains/agent");
  const nextWorkspaceIds = selectWorkspaces().map((workspace) => workspace.id);
  const removedWorkspaceIds = previousWorkspaces
    .filter((workspace) => !nextWorkspaceIds.includes(workspace.id))
    .map((workspace) => workspace.id);

  const removedTabIds = retainWorkspaceTabs(nextWorkspaceIds);

  // Re-resolve the tab for the current workspace after the list changes.
  // workbenchNavigationStore is the single source of truth for which workspace
  // is active; tabStore only needs to know which tab to show for it.
  resolveTabForWorkspace(workbenchNavigationStore.getState().activeWorkspaceId);

  if (removedTabIds.length > 0) {
    removeTabData(removedTabIds);
  }
  if (removedWorkspaceIds.length > 0) {
    removeWorkspaceTaskCounts(removedWorkspaceIds);
  }
}
