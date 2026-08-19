import type { WorkspaceItem } from "../../model/workspaceTypes";
import type { WorkspaceStorePersistedState, WorkspaceStoreState } from "../workspaceStoreTypes";

export const initialWorkspaceState: Pick<WorkspaceStoreState, "workspaces" | "orderedWorkspaceIds"> = {
  workspaces: [],
  orderedWorkspaceIds: [],
};

export function partializeWorkspaceState(_state: WorkspaceStoreState): WorkspaceStorePersistedState {
  // Phase 3: project preferences (displayProjectIds, lastUsedExternalAppId,
  // organizationPreferencesById, workspaceListHierarchyMode) moved to the
  // project store (yishan-project-store). Nothing workspace-scoped persists
  // here anymore; keep the empty shape so the persist key stays valid.
  return {};
}
