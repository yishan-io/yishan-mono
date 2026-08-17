import { workspaceProjectionStore } from "./workspaceProjectionStore";
import { workspaceStore } from "./workspaceStore";

/**
 * Workspace feature selectors — the public read surface for Workspace State
 * (Phase 12, desktop5.md). Cross-feature code reads workspace state through
 * these functions instead of importing the Workspace Store directly.
 */
export function selectWorkspaceFileTreeRefreshVersion(workspaceWorktreePath: string): number {
  return workspaceProjectionStore.getState().gitRefreshVersionByWorktreePath?.[workspaceWorktreePath] ?? 0;
}

/** Reads the currently selected project id. */
export function selectSelectedProjectId() {
  return workspaceStore.getState().selectedProjectId;
}

/** Reads the currently selected workspace id. */
export function selectSelectedWorkspaceId() {
  return workspaceStore.getState().selectedWorkspaceId;
}

/** Reads the full workspace list. */
export function selectWorkspaces() {
  return workspaceStore.getState().workspaces;
}
