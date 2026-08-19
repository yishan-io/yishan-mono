
/**
 * Git feature public API (Phase 12, desktop5.md).
 */
export type {
  GitPullRequest,
  GitPullRequestCheck,
  GitPullRequestDeployment,
  GitPullRequestSummary,
} from "./gitPullRequestTypes";
export { diffTabContentStore, type DiffTabContentStoreState } from "./state/diffTabContentStore";
export { refreshDiffTabContent, removeDiffTabContent, seedDiffTabContent } from "./commands/diffTabContentCommands";
export { commitGitChanges, getGitAuthorName, getGitBranchStatus, inspectGitRepository, inspectGitRepositoryPath, listGitBranches, listGitChanges, listGitCommitsToTarget, publishGitBranch, pushGitBranch, readBranchComparisonDiff, readCommitDiff, readDiff, renameGitBranch, revertGitChanges, trackGitChanges, unstageGitChanges } from "./commands/gitCommands";
export { useGitAuthorName } from "./hooks/useGitAuthorName";
export { incrementGitRefreshVersion, listPullRequestHistory, refreshWorkspaceGitChanges, refreshWorkspacePullRequest, setWorkspaceCurrentBranch, setWorkspacePullRequest } from "./commands/gitProjectionCommands";
export { gitProjectionStore, type GitProjectionStoreState } from "./state/gitProjectionStore";

export { createAllWorkspacesGitSyncRuntime, type AllWorkspacesGitSyncRuntime, type WorkspaceRefreshState } from "./runtime/allWorkspacesGitSyncRuntime";

export { useAllWorkspacesGitSync } from "./hooks/useAllWorkspacesGitSync";

// Stable UI entry points for cross-feature composition (Phase 18).
export { ChangesTabView } from "./features/changes-tab/ChangesTabView";
export { PullRequestTabView } from "./features/pull-request-tab/PullRequestTabView";
export { useWorkspacePullRequestState } from "./features/pull-request-tab/useWorkspacePullRequestState";
export { GitChangeTotals } from "./ui/GitChangeTotals";
export { BranchBadge } from "./ui/BranchBadge";
export { PullRequestIcon } from "./ui/PullRequestIcon";
export { ProjectCommitComparison } from "./features/project-git-changes/ProjectCommitComparison";

export { livePrStatus } from "./gitPullRequestStatus";

import { gitProjectionStore } from "./state/gitProjectionStore";