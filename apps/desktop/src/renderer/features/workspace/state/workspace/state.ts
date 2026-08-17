import type {
  WorkspaceItem,
  WorkspaceProjectRecord,
  WorkspaceStorePersistedState,
  WorkspaceStoreState,
} from "../../../../features/workbench/model/types";

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

export function partializeWorkspaceState(_state: WorkspaceStoreState): WorkspaceStorePersistedState {
  // Phase 3: project preferences (displayProjectIds, lastUsedExternalAppId,
  // organizationPreferencesById, workspaceListHierarchyMode) moved to the
  // project store (yishan-project-store). Nothing workspace-scoped persists
  // here anymore; keep the empty shape so the persist key stays valid.
  return {};
}
