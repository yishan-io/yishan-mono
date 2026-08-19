import { projectStore, supportsGitFeatures } from "@renderer/domains/project";


import {  isFolderWorkspace, refreshWorkspacePullRequest as refreshWorkspacePullRequestRpc, workspaceStore } from "@renderer/domains/workspace";
import { isWorkspaceNotFoundError } from "@shared/errors/getErrorMessage";
/**
 * Git feature projection Commands (desktop6-adjust.md W4).
 *
 * Owns Git polling and projection updates that previously lived in the
 * Workspace feature commands: workspace git change refresh, pull-request
 * refresh, and pull-request history queries. Git reads Workspace paths
 * through the Workspace public API (`workspaceStore`) and writes the
 * projections to its own Store.
 */
import { getGitRpc } from "../daemon/daemonGitClient";
import { listWorkspacePullRequests } from "../api/workspacePullRequestApi";
import {
  computeUniqueGitChangeFileCount,
  countWorkspaceGitChanges,
  summarizeReconciledWorkspaceGitChangeTotals,
} from "../gitChangeSummary";
import { gitProjectionStore } from "../state/gitProjectionStore";

/**
 * Resolves the normalized target branch (origin-prefixed) for a workspace,
 * matching the convention used by the Changes tab comparison.
 */
function resolveWorkspaceTargetBranch(workspaceId: string): string | undefined {
  const workspace = workspaceStore.getState().workspaces.find((ws) => ws.id === workspaceId);
  const sourceBranch = workspace?.sourceBranch?.trim();
  if (!sourceBranch) {
    return undefined;
  }
  if (sourceBranch.startsWith("origin/") || sourceBranch.includes("/")) {
    return sourceBranch;
  }
  return `origin/${sourceBranch}`;
}

/** Loads workspace git change sections and stores the aggregated count.
 *
 * The count combines:
 * 1. Uncommitted working-tree changes (staged + unstaged + untracked file count).
 * 2. Committed branch-diff changes against the workspace's source branch
 *    (files changed between merge-base and HEAD).
 *
 * The two sets are merged by unique file path so a file that appears in both
 * the branch diff and the working tree is only counted once.
 *
 * The totals (additions/deletions) similarly combine both sources.
 */
export async function refreshWorkspaceGitChanges(workspaceId: string): Promise<void> {
  if (!workspaceId) {
    return;
  }

  const workspace = workspaceStore.getState().workspaces.find((workspace) => workspace.id === workspaceId);
  if (!workspace) {
    return;
  }

  // Folder workspaces (kind="folder"/sentinel project id) and non-git
  // projects have no git state to poll.
  if (isFolderWorkspace(workspace)) {
    return;
  }
  const project = projectStore
    .getState()
    .projects.find((item) => item.id === (workspace.projectId ?? workspace.repoId));
  if (!supportsGitFeatures(project?.sourceType)) {
    return;
  }

  if (workspace.state && workspace.state !== "active") {
    return;
  }

  const workspaceWorktreePath = workspace.worktreePath?.trim();
  if (!workspaceWorktreePath) {
    return;
  }

  try {
    const gitRpc = await getGitRpc();
    const targetBranch = resolveWorkspaceTargetBranch(workspaceId);

    // Fetch uncommitted changes and (optionally) branch diff summary in parallel.
    const [sections, branchSummary] = await Promise.all([
      gitRpc.listChanges({ workspaceId }),
      targetBranch
        ? gitRpc.getBranchDiffSummary({ workspaceId, targetBranch }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const uncommittedCount = countWorkspaceGitChanges(sections);
    const uncommittedTotals = summarizeReconciledWorkspaceGitChangeTotals(sections);

    if (!branchSummary) {
      // No source branch configured — fall back to uncommitted-only count.
      gitProjectionStore.getState().setWorkspaceGitChangesCount(workspaceId, uncommittedCount);
      gitProjectionStore.getState().setWorkspaceGitChangeTotals(workspaceId, uncommittedTotals);
      return;
    }

    const combinedCount = computeUniqueGitChangeFileCount(branchSummary.files ?? [], sections);
    const combinedTotals = {
      additions: branchSummary.additions + uncommittedTotals.additions,
      deletions: branchSummary.deletions + uncommittedTotals.deletions,
    };

    gitProjectionStore.getState().setWorkspaceGitChangesCount(workspaceId, combinedCount);
    gitProjectionStore.getState().setWorkspaceGitChangeTotals(workspaceId, combinedTotals);
  } catch (error) {
    if (isWorkspaceNotFoundError(error)) {
      return;
    }
    console.error("Failed to refresh workspace git changes", error);
  }
}

/** Re-queries the daemon for the selected workspace pull request state. */
export async function refreshWorkspacePullRequest(workspaceId: string): Promise<void> {
  if (!workspaceId) {
    return;
  }

  const workspace = workspaceStore.getState().workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    return;
  }

  // Folder workspaces have no git state nor pull requests: never query the daemon.
  if (isFolderWorkspace(workspace)) {
    return;
  }

  try {
    const refreshedWorkspace = await refreshWorkspacePullRequestRpc({
      workspaceId,
    });

    gitProjectionStore.getState().setWorkspacePullRequest(workspaceId, refreshedWorkspace.pullRequest);
  } catch (error) {
    console.error("Failed to refresh workspace pull request", error);
    throw error;
  }
}

/** Lists historical pull request records for one workspace from the API service. */
export async function listPullRequestHistory(orgId: string, projectId: string, workspaceId: string) {
  return listWorkspacePullRequests(orgId, projectId, workspaceId);
}

/** Stores one workspace pull request in the git projection store. */
export function setWorkspacePullRequest(
  workspaceId: string,
  pullRequest: Parameters<ReturnType<typeof gitProjectionStore.getState>["setWorkspacePullRequest"]>[1],
): void {
  gitProjectionStore.getState().setWorkspacePullRequest(workspaceId, pullRequest);
}

/** Stores the current branch for one workspace in the git projection store. */
export function setWorkspaceCurrentBranch(workspaceId: string, branch: string): void {
  gitProjectionStore.getState().setWorkspaceCurrentBranch(workspaceId, branch);
}

/** Bumps the git refresh version for one worktree path. */
export function incrementGitRefreshVersion(workspaceWorktreePath: string): void {
  gitProjectionStore.getState().incrementGitRefreshVersion(workspaceWorktreePath);
}
