/**
 * Git feature public API (Phase 12, desktop5.md).
 */
export type { GitCommands } from "./commands/contract";
export { diffTabContentStore, type DiffTabContentStoreState } from "./state/diffTabContentStore";
export { refreshDiffTabContent, seedDiffTabContent } from "./commands/diffTabContentCommands";
export {
  incrementGitRefreshVersion,
  listPullRequestHistory,
  refreshWorkspaceGitChanges,
  refreshWorkspacePullRequest,
  setWorkspacePullRequest,
} from "./commands/gitProjectionCommands";
export {
  gitProjectionStore,
  type GitProjectionStoreState,
} from "./state/gitProjectionStore";
export {
  useWorkspaceGitChangeTotalsByWorkspaceId,
  useWorkspaceGitRefreshVersion,
  useWorkspacePullRequestByWorkspaceId,
} from "./ui/hooks/useGitProjectionReadHooks";
export {
  createAllWorkspacesGitSyncRuntime,
  type AllWorkspacesGitSyncRuntime,
  type WorkspaceRefreshState,
} from "./runtime/allWorkspacesGitSyncRuntime";

// Stable UI entry points for cross-feature composition (Phase 18).
export { ChangesTabView } from "./ui/ChangesTabView";
export { PullRequestTabView } from "./ui/PullRequestTabView";
export { useWorkspacePullRequestState } from "./ui/useWorkspacePullRequestState";
