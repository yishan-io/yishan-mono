/**
 * Git feature public API (Phase 12, desktop5.md).
 */
export type { GitCommands } from "./commands/contract";
export { diffTabContentStore, type DiffTabContentStoreState } from "./state/diffTabContentStore";
export { refreshDiffTabContent, seedDiffTabContent } from "./commands/diffTabContentCommands";
export {
  getGitAuthorName,
  inspectGitRepository,
  listGitBranches,
  listGitChanges,
  listGitCommitsToTarget,
  readBranchComparisonDiff,
  readCommitDiff,
  readDiff,
  revertGitChanges,
  trackGitChanges,
  unstageGitChanges,
} from "./commands/gitCommands";
export { useGitAuthorName } from "./hooks/useGitAuthorName";
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
} from "./hooks/useGitProjectionReadHooks";
export {
  createAllWorkspacesGitSyncRuntime,
  type AllWorkspacesGitSyncRuntime,
  type WorkspaceRefreshState,
} from "./runtime/allWorkspacesGitSyncRuntime";

export { useAllWorkspacesGitSync } from "./hooks/useAllWorkspacesGitSync";

// Stable UI entry points for cross-feature composition (Phase 18).
export { ChangesTabView } from "./features/changes-tab/ChangesTabView";
export { PullRequestTabView } from "./features/pull-request-tab/PullRequestTabView";
export { useWorkspacePullRequestState } from "./features/pull-request-tab/useWorkspacePullRequestState";
export { GitChangeTotals } from "./ui/GitChangeTotals";
export { ProjectCommitComparison } from "./features/project-git-changes/ProjectCommitComparison";
