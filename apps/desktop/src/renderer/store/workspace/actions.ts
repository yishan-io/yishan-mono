import { createWorkspaceRepoActions } from "./actions.projects";
import { createWorkspaceSelectionActions } from "./actions.selection";
import { createWorkspaceActions } from "./actions.workspaces";
import type { WorkspaceStoreActions, WorkspaceStoreGetState, WorkspaceStoreSetState } from "../types";

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
