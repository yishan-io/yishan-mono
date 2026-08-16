import { workspaceProjectionStore } from "./workspaceProjectionStore";

/**
 * Workspace feature selectors — the public read surface for Workspace State
 * (Phase 12, desktop5.md). Cross-feature code reads workspace state through
 * these functions instead of importing the Workspace Store directly.
 */
export function selectWorkspaceFileTreeRefreshVersion(workspaceWorktreePath: string): number {
  return workspaceProjectionStore.getState().gitRefreshVersionByWorktreePath?.[workspaceWorktreePath] ?? 0;
}
