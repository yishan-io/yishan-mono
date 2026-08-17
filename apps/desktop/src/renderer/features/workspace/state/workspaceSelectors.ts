import { workspaceProjectionStore } from "./workspaceProjectionStore";
import { workspaceStore } from "./workspaceStore";

/**
 * Workspace feature selectors — the public read surface for Workspace State
 * (Phase 12, desktop5.md). Cross-feature code reads workspace state through
 * these functions instead of importing the Workspace Store directly.
 *
 * Active Workspace/Project context lives in the Workbench navigation Store
 * (desktop6-adjust.md W2); callers read `workbenchNavigationStore` directly.
 */
export function selectWorkspaceFileTreeRefreshVersion(workspaceWorktreePath: string): number {
  return workspaceProjectionStore.getState().gitRefreshVersionByWorktreePath?.[workspaceWorktreePath] ?? 0;
}

/** Reads the full workspace list. */
export function selectWorkspaces() {
  return workspaceStore.getState().workspaces;
}
