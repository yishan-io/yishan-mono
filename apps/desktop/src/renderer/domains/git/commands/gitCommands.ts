import { readDiff as readWorkspaceFileDiff } from "@renderer/domains/files";
import { projectStore, supportsGitFeatures } from "@renderer/domains/project";

import { isFolderWorkspace, workspaceStore } from "@renderer/domains/workspace";
import type { GitChangesBySection } from "../daemon/daemonGitClient";
import { getGitRpc } from "../daemon/daemonGitClient";

const inFlightListGitChangesByWorkspaceId = new Map<string, Promise<GitChangesBySection>>();
const inFlightGitAuthorNameByWorkspaceId = new Map<string, Promise<string | null>>();
const gitAuthorNameByWorkspaceId = new Map<string, string | null>();

/** Resolves a workspaceId from store when only a worktreePath is available (repo-root branch listing). */
function resolveWorkspaceIdFromPath(workspaceWorktreePath: string): string {
  const workspace = workspaceStore
    .getState()
    .workspaces.find((item) => item.worktreePath?.trim() === workspaceWorktreePath);
  if (!workspace?.id) {
    throw new Error(`workspaceId is required for worktree path: ${workspaceWorktreePath}`);
  }
  return workspace.id;
}

/** Reads old/new file content for one workspace diff view. */
export async function readDiff(params: { workspaceId: string; relativePath: string }) {
  return readWorkspaceFileDiff(params);
}

/** Reads old/new file content for one specific commit file diff view. */
export async function readCommitDiff(params: {
  workspaceId: string;
  commitHash: string;
  relativePath: string;
}) {
  const gitRpc = await getGitRpc();
  return gitRpc.readCommitDiff({
    workspaceId: params.workspaceId,
    commitHash: params.commitHash,
    relativePath: params.relativePath,
  });
}

/** Reads old/new file content for one target-branch-to-head file diff view. */
export async function readBranchComparisonDiff(params: {
  workspaceId: string;
  targetBranch: string;
  relativePath: string;
}) {
  const gitRpc = await getGitRpc();
  return gitRpc.readBranchComparisonDiff({
    workspaceId: params.workspaceId,
    targetBranch: params.targetBranch,
    relativePath: params.relativePath,
  });
}

/** Lists git changes grouped by section for one workspace. */
export async function listGitChanges(params: { workspaceId: string }) {
  const workspaceId = params.workspaceId.trim();

  // Non-git projects have no git state: return empty sections instead of
  // hitting the daemon guard, which would surface a noisy RPC error from
  // mount-time consumers (file-tree badges, changes tab).
  const workspace = workspaceStore.getState().workspaces.find((item) => item.id === workspaceId);
  const project = projectStore
    .getState()
    .projects.find((item) => item.id === (workspace?.projectId ?? workspace?.repoId));
  if (isFolderWorkspace(workspace) || !supportsGitFeatures(project?.sourceType)) {
    return { staged: [], unstaged: [], untracked: [] };
  }

  const inFlightRequest = inFlightListGitChangesByWorkspaceId.get(workspaceId);
  if (inFlightRequest) {
    return await inFlightRequest;
  }

  const request = (async () => {
    const gitRpc = await getGitRpc();
    return await gitRpc.listChanges({ workspaceId });
  })();

  inFlightListGitChangesByWorkspaceId.set(workspaceId, request);
  try {
    return await request;
  } finally {
    inFlightListGitChangesByWorkspaceId.delete(workspaceId);
  }
}

/** Stages one or more changed paths for one workspace. */
export async function trackGitChanges(params: { workspaceId: string; relativePaths: string[] }) {
  const gitRpc = await getGitRpc();
  return gitRpc.trackChanges({
    workspaceId: params.workspaceId,
    relativePaths: params.relativePaths,
  });
}

/** Unstages one or more changed paths for one workspace. */
export async function unstageGitChanges(params: { workspaceId: string; relativePaths: string[] }) {
  const gitRpc = await getGitRpc();
  return gitRpc.unstageChanges({
    workspaceId: params.workspaceId,
    relativePaths: params.relativePaths,
  });
}

/** Reverts one or more changed paths for one workspace. */
export async function revertGitChanges(params: { workspaceId: string; relativePaths: string[] }) {
  const gitRpc = await getGitRpc();
  return gitRpc.revertChanges({
    workspaceId: params.workspaceId,
    relativePaths: params.relativePaths,
  });
}

/** Creates one git commit in one workspace. */
export async function commitGitChanges(params: {
  workspaceId: string;
  message: string;
  amend?: boolean;
  signoff?: boolean;
}) {
  const gitRpc = await getGitRpc();
  return gitRpc.commitChanges({
    workspaceId: params.workspaceId,
    message: params.message,
    amend: params.amend,
    signoff: params.signoff,
  });
}

/** Reads upstream and ahead/behind status for one workspace branch. */
export async function getGitBranchStatus(params: { workspaceId: string }) {
  const gitRpc = await getGitRpc();
  return gitRpc.getBranchStatus({ workspaceId: params.workspaceId });
}

/** Lists commits from current branch to one target branch. */
export async function listGitCommitsToTarget(params: {
  workspaceId: string;
  targetBranch: string;
}) {
  const gitRpc = await getGitRpc();
  return gitRpc.listCommitsToTarget({
    workspaceId: params.workspaceId,
    targetBranch: params.targetBranch,
  });
}

/** Inspects a workspace for git repository metadata including the current branch. */
export async function inspectGitRepository(params: { workspaceId: string }): Promise<{
  isGitRepository: boolean;
  remoteUrl?: string;
  currentBranch?: string;
}> {
  const workspace = workspaceStore.getState().workspaces.find((item) => item.id === params.workspaceId.trim());

  // Folder workspaces have no git repository: never fire git.inspect for them.
  if (isFolderWorkspace(workspace)) {
    return { isGitRepository: false };
  }

  const gitRpc = await getGitRpc();
  return gitRpc.inspect({ workspaceId: params.workspaceId });
}

/** Inspects a local path (not a workspace) for git repository metadata. */
export async function inspectGitRepositoryPath(params: { path: string }): Promise<{
  isGitRepository: boolean;
  remoteUrl?: string;
  currentBranch?: string;
}> {
  const gitRpc = await getGitRpc();
  return gitRpc.inspectPath({ path: params.path });
}

/** Renames the current branch of one workspace (workspace domain consumes this). */
export async function renameGitBranch(params: { workspaceId: string; nextBranch: string }) {
  const gitRpc = await getGitRpc();
  return gitRpc.renameBranch(params);
}

/** Lists available branch names for one workspace. */
export async function listGitBranches(params: { workspaceId?: string; workspaceWorktreePath?: string }) {
  const workspaceId =
    params.workspaceId?.trim() ||
    (params.workspaceWorktreePath ? resolveWorkspaceIdFromPath(params.workspaceWorktreePath.trim()) : "");
  if (!workspaceId) {
    throw new Error("workspaceId or workspaceWorktreePath is required");
  }
  const gitRpc = await getGitRpc();
  return gitRpc.listBranches({ workspaceId });
}

/** Pushes one workspace branch to its upstream. */
export async function pushGitBranch(params: { workspaceId: string }) {
  const gitRpc = await getGitRpc();
  return gitRpc.pushBranch({ workspaceId: params.workspaceId });
}

/** Publishes one workspace branch and configures upstream tracking. */
export async function publishGitBranch(params: { workspaceId: string }) {
  const gitRpc = await getGitRpc();
  return gitRpc.publishBranch({ workspaceId: params.workspaceId });
}

/** Reads one repository's resolved git `user.name` value for branch-prefix `Git author` usage. */
export async function getGitAuthorName(params: { workspaceId: string }) {
  const workspaceId = params.workspaceId.trim();
  if (gitAuthorNameByWorkspaceId.has(workspaceId)) {
    return gitAuthorNameByWorkspaceId.get(workspaceId) ?? null;
  }

  const inFlightRequest = inFlightGitAuthorNameByWorkspaceId.get(workspaceId);
  if (inFlightRequest) {
    return await inFlightRequest;
  }

  const request = (async () => {
    const gitRpc = await getGitRpc();
    return await gitRpc.getAuthorName({ workspaceId });
  })();

  inFlightGitAuthorNameByWorkspaceId.set(workspaceId, request);
  try {
    const authorName = (await request) ?? null;
    if (authorName !== null) {
      gitAuthorNameByWorkspaceId.set(workspaceId, authorName);
    }
    return authorName;
  } finally {
    inFlightGitAuthorNameByWorkspaceId.delete(workspaceId);
  }
}

/** Merges one pull request for one workspace through the daemon gh CLI. */
export async function mergePullRequest(params: {
  workspaceId: string;
  prNumber: number;
  method?: "merge" | "squash" | "rebase";
  deleteBranch?: boolean;
}): Promise<{ output: string }> {
  const gitRpc = await getGitRpc();
  return gitRpc.mergePullRequest({
    workspaceId: params.workspaceId,
    prNumber: params.prNumber,
    method: params.method,
    deleteBranch: params.deleteBranch,
  });
}

/** Closes one pull request for one workspace through the daemon gh CLI. */
export async function closePullRequest(params: {
  workspaceId: string;
  prNumber: number;
}): Promise<{ output: string }> {
  const gitRpc = await getGitRpc();
  return gitRpc.closePullRequest({
    workspaceId: params.workspaceId,
    prNumber: params.prNumber,
  });
}
