import { tabStore } from "../store/tabStore";
import { workspaceUiStore } from "../store/workspaceUiStore";
import { workspaceStore } from "../store/workspaceStore";

/** Selects one project and syncs tab selection to the newly selected workspace. */
export function setSelectedRepo(projectId: string): void {
  if (projectId.trim()) {
    workspaceUiStore.getState().setScheduledJobPanelOpen(false);
  }
  workspaceStore.getState().setSelectedProjectId(projectId);
  tabStore.getState().setSelectedWorkspaceId(workspaceStore.getState().selectedWorkspaceId);
}

/** Selects one workspace in both workspace and tab stores. */
export function setSelectedWorkspace(workspaceId: string): void {
  if (workspaceId.trim()) {
    workspaceUiStore.getState().setScheduledJobPanelOpen(false);
  }
  workspaceStore.getState().setSelectedWorkspaceId(workspaceId);
  tabStore.getState().setSelectedWorkspaceId(workspaceId);
}
