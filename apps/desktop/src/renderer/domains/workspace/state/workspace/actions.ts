import type { WorkspaceStoreActions, WorkspaceStoreGetState, WorkspaceStoreSetState } from "../workspaceStoreTypes";
import { createLocalFolderActions } from "./actions.localFolders";
import { createWorkspaceActions } from "./actions.workspaces";

export function createWorkspaceStoreActions(
  set: WorkspaceStoreSetState,
  get: WorkspaceStoreGetState,
): WorkspaceStoreActions {
  return {
    ...createWorkspaceActions(set, get),
    ...createLocalFolderActions(set, get),
  };
}
