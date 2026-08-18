/**
 * Git feature public API (Phase 12, desktop5.md).
 */
export type { GitCommands } from "./commands/contract";
export { diffTabContentStore, type DiffTabContentStoreState } from "./state/diffTabContentStore";
export { refreshDiffTabContent, seedDiffTabContent } from "./commands/diffTabContentCommands";
export { readBranchComparisonDiff, readCommitDiff, readDiff } from "./commands/gitCommands";
export {
  incrementGitRefreshVersion,
  listPullRequestHistory,
  refreshWorkspaceGitChanges,
  refreshWorkspacePullRequest,
  setWorkspaceCurrentBranch,
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

export { useAllWorkspacesGitSync } from "./ui/hooks/useAllWorkspacesGitSync";

// Stable UI entry points for cross-feature composition (Phase 18).
export { ChangesTabView } from "./ui/ChangesTabView";
export { PullRequestTabView } from "./ui/PullRequestTabView";
export { useWorkspacePullRequestState } from "./ui/useWorkspacePullRequestState";
export { GitChangeTotals } from "./ui/GitChangeTotals";
export { ProjectCommitComparison } from "./ui/ProjectCommitComparison";
