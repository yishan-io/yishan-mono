import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";
import { workspaceUiStore } from "../store/workspaceUiStore";

/** Selects one project and syncs tab selection to the newly selected workspace. */
export function setSelectedRepo(projectId: string): void {
  if (projectId.trim()) {
    workspaceUiStore.getState().setScheduledJobPanelOpen(false);
  }
  workspaceStore.getState().setSelectedProjectId(projectId);
  tabStore.getState().resolveTabForWorkspace(workspaceStore.getState().selectedWorkspaceId);
}

/** Selects one workspace and resolves the correct tab for it. */
export function setSelectedWorkspace(workspaceId: string): void {
  if (workspaceId.trim()) {
    workspaceUiStore.getState().setScheduledJobPanelOpen(false);
  }
  workspaceStore.getState().setSelectedWorkspaceId(workspaceId);
  tabStore.getState().resolveTabForWorkspace(workspaceId);
}
