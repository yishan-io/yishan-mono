import type { WorkspaceStoreActions, WorkspaceStoreGetState, WorkspaceStoreSetState } from "../types";
import { createWorkspaceRepoActions } from "./actions.projects";
import { createWorkspaceSelectionActions } from "./actions.selection";
import { createWorkspaceActions } from "./actions.workspaces";

export function createWorkspaceStoreActions(
  set: WorkspaceStoreSetState,
  get: WorkspaceStoreGetState,
): WorkspaceStoreActions {
  return {
    ...createWorkspaceSelectionActions(set, get),
    ...createWorkspaceRepoActions(set, get),
    ...createWorkspaceActions(set, get),
  };
}
