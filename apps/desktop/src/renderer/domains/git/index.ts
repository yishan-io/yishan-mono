/**
 * Git feature public API.
 */
export type {
  GitPullRequest,
  GitPullRequestCheck,
  GitPullRequestDeployment,
  GitPullRequestSummary,
} from "./pull-request/gitPullRequestTypes";
export { diffTabContentStore, type DiffTabContentStoreState } from "./state/diffTabContentStore";
export { refreshDiffTabContent, removeDiffTabContent, seedDiffTabContent } from "./commands/diffTabContentCommands";
export {
  commitGitChanges,
  getGitAuthorName,
  getGitBranchStatus,
  inspectGitRepository,
  inspectGitRepositoryPath,
  listGitBranches,
  listGitChanges,
  listGitCommitsToTarget,
  publishGitBranch,
  pushGitBranch,
  readBranchComparisonDiff,
  readCommitDiff,
  readDiff,
  renameGitBranch,
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
export { gitProjectionStore, type GitProjectionStoreState } from "./state/gitProjectionStore";

export type { AllWorkspacesGitSyncRuntime, WorkspaceRefreshState } from "./runtime/allWorkspacesGitSyncRuntime";

export { useAllWorkspacesGitSync } from "./hooks/useAllWorkspacesGitSync";

// Stable UI entry points for cross-feature composition.
export { ChangesTabView } from "./features/changes-tab/ChangesTabView";
export { PullRequestTabView } from "./features/pull-request-tab/PullRequestTabView";
export { useWorkspacePullRequestState } from "./features/pull-request-tab/useWorkspacePullRequestState";
export { GitChangeTotals } from "./ui/GitChangeTotals";

export { PullRequestIcon } from "./ui/PullRequestIcon";

export { livePrStatus } from "./pull-request/gitPullRequestStatus";
