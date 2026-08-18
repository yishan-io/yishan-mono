import type { WorkspaceProjectRecord } from "../../../project/model/projectTypes";
import type { WorkspaceItem } from "../../model/workspaceTypes";
import type { WorkspaceStorePersistedState, WorkspaceStoreState } from "../workspaceStoreTypes";

/** Builds workspace store state from backend snapshot data without creating implicit tabs. */
export function buildWorkspaceStateFromData(input: {
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
}): Pick<WorkspaceStoreState, "projects" | "workspaces"> {
  return {
    projects: input.projects,
    workspaces: input.workspaces,
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
