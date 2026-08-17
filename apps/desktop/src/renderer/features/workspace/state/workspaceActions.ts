import { workspaceProjectionStore } from "./workspaceProjectionStore";

/**
 * Workspace feature state actions — the public state-change surface for
 * Workspace State (Phase 12, desktop5.md). Cross-feature commands apply
 * workspace state changes through these functions instead of importing the
 * Workspace Store directly.
 */
export function incrementGitRefreshVersion(workspaceWorktreePath: string): void {
  workspaceProjectionStore.getState().incrementGitRefreshVersion(workspaceWorktreePath);
}
