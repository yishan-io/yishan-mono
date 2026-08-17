import { tabStore } from "../../../features/workbench/state/tabStore";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";
import { workspaceUiStore } from "../../../features/workspace/state/workspaceUiStore";

/** Selects one project and syncs tab selection to the newly selected workspace. */
export function setSelectedRepo(projectId: string): void {
  if (projectId.trim()) {
    workspaceUiStore.getState().closeOverlayPanel();
  }
  workspaceStore.getState().setSelectedProjectId(projectId);
  tabStore.getState().resolveTabForWorkspace(workspaceStore.getState().selectedWorkspaceId);
}

/** Selects one workspace and resolves the correct tab for it. */
export function setSelectedWorkspace(workspaceId: string): void {
  if (workspaceId.trim()) {
    workspaceUiStore.getState().closeOverlayPanel();
  }
  workspaceStore.getState().setSelectedWorkspaceId(workspaceId);
  tabStore.getState().resolveTabForWorkspace(workspaceId);
}
