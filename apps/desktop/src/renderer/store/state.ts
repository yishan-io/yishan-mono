import type { ProjectRecord } from "../api/types";
import type { RepoWorkspaceItem, WorkspaceStorePersistedState, WorkspaceStoreState } from "./types";

/** Builds workspace store state from backend snapshot data without creating implicit tabs. */
export function buildWorkspaceStateFromData(input: {
  projects: ProjectRecord[];
  workspaces: RepoWorkspaceItem[];
  preferredProjectId?: string;
  preferredWorkspaceId?: string;
}): Pick<
  WorkspaceStoreState,
  "projects" | "workspaces" | "selectedProjectId" | "selectedWorkspaceId"
> {
  const resolveWorkspaceProjectId = (workspace: RepoWorkspaceItem): string => {
    return workspace.projectId ?? workspace.repoId;
  };
  const preferredProjectExists =
    input.preferredProjectId && input.projects.some((project) => project.id === input.preferredProjectId);
  const selectedProjectId = preferredProjectExists ? (input.preferredProjectId as string) : (input.projects[0]?.id ?? "");
  const preferredWorkspaceBelongsToSelectedProject =
    input.preferredWorkspaceId &&
    input.workspaces.some(
      (workspace) => workspace.id === input.preferredWorkspaceId && resolveWorkspaceProjectId(workspace) === selectedProjectId,
    );
  const selectedWorkspaceId = preferredWorkspaceBelongsToSelectedProject
    ? (input.preferredWorkspaceId as string)
    : (input.workspaces.find((workspace) => resolveWorkspaceProjectId(workspace) === selectedProjectId)?.id ?? "");

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
  };
}
