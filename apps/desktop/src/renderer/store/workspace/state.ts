import type {
  WorkspaceItem,
  WorkspaceProjectRecord,
  WorkspaceStorePersistedState,
  WorkspaceStoreState,
} from "../types";

/** Builds workspace store state from backend snapshot data without creating implicit tabs. */
export function buildWorkspaceStateFromData(input: {
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
}): Pick<WorkspaceStoreState, "projects" | "workspaces" | "selectedProjectId" | "selectedWorkspaceId"> {
  const resolveWorkspaceProjectId = (workspace: WorkspaceItem): string => {
    return workspace.projectId ?? workspace.repoId;
  };
  const selectedProjectId = input.projects[0]?.id ?? "";
  const selectedWorkspaceId =
    input.workspaces.find((workspace) => resolveWorkspaceProjectId(workspace) === selectedProjectId)?.id ?? "";

  return {
    projects: input.projects,
    workspaces: input.workspaces,
    selectedProjectId,
    selectedWorkspaceId,
  };
}

export const initialWorkspaceState = buildWorkspaceStateFromData({
  projects: [],
  workspaces: [],
});

export function partializeWorkspaceState(state: WorkspaceStoreState): WorkspaceStorePersistedState {
  return {
    displayProjectIds: state.displayProjectIds,
    lastUsedExternalAppId: state.lastUsedExternalAppId,
    organizationPreferencesById: state.organizationPreferencesById,
    workspaceListHierarchyMode: state.workspaceListHierarchyMode,
  };
}
