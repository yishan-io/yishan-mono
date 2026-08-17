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
export { incrementGitRefreshVersion, setOrderedWorkspaceIds, setWorkspacePullRequest } from "./state/workspaceActions";
export {
  useSelectedProjectId,
  useSelectedWorkspaceId,
  useSelectedWorkspaceWorktreePath,
  useWorkspaceGitChangeTotalsByWorkspaceId,
  useWorkspacePullRequestByWorkspaceId,
  useWorkspaceGitRefreshVersion,
  useWorkspaces,
} from "./ui/hooks/useWorkspaceReadHooks";

// Stable UI entry points for cross-feature composition (Phase 18).
export { CreateWorkspaceDialogView } from "./ui/LeftPane/CreateWorkspaceDialogView";
export { WorkspaceDeleteDialogView } from "./ui/LeftPane/WorkspaceDeleteDialogView";
export { WorkspaceInfoPopperView } from "./ui/LeftPane/WorkspaceInfoPopperView";
export { type PendingWorkspaceDeletion, useWorkspaceDeletionFlow } from "./ui/LeftPane/useWorkspaceDeletionFlow";
export { useWorkspaceInfoHover } from "./ui/LeftPane/useWorkspaceInfoHover";
