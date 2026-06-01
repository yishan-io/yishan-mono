import { chatStore } from "../store/chatStore";
import { tabStore } from "../store/tabStore";
import type { WorkspaceItem } from "../store/types";
import { workspaceStore } from "../store/workspaceStore";

/** Reconciles tab/chat state after workspace list changes in workspace store. */
export function syncTabStoreWithWorkspace(previousWorkspaces: WorkspaceItem[]): void {
  const nextWorkspaceIds = workspaceStore.getState().workspaces.map((workspace) => workspace.id);
  const removedWorkspaceIds = previousWorkspaces
    .filter((workspace) => !nextWorkspaceIds.includes(workspace.id))
    .map((workspace) => workspace.id);

  const tabState = tabStore.getState();
  const removedTabIds = tabState.retainWorkspaceTabs(nextWorkspaceIds);

  // Only update the tab store selection when the currently selected workspace
  // was removed. The tab store owns the selection — overwriting it
  // unconditionally causes the UI to jump back to a stale preference after
  // background snapshot refreshes (e.g. during workspace creation).
  const currentTabSelectedId = tabStore.getState().selectedWorkspaceId;
  const currentSelectionStillExists = nextWorkspaceIds.includes(currentTabSelectedId);
  if (!currentSelectionStillExists) {
    tabState.setSelectedWorkspaceId(workspaceStore.getState().selectedWorkspaceId);
  }

  if (removedTabIds.length > 0) {
    chatStore.getState().removeTabData(removedTabIds);
  }
  if (removedWorkspaceIds.length > 0) {
    chatStore.getState().removeWorkspaceTaskCounts(removedWorkspaceIds);
  }
}
