/**
 * Workspace feature public API (Phase 12, desktop5.md).
 *
 * Exports the stable command surface, workspace models, and the public State
 * surfaces (selectors + actions). The Workspace Stores are internal.
 */
export type { WorkspaceCommands } from "./commands/contract";
export type {
  WorkspaceGitChangeTotals,
  WorkspaceHealth,
  WorkspaceItem,
  WorkspaceLifecycleState,
  WorkspaceStatus,
} from "./model/workspaceTypes";
export { selectWorkspaceFileTreeRefreshVersion } from "./state/workspaceSelectors";
export { incrementGitRefreshVersion } from "./state/workspaceActions";
