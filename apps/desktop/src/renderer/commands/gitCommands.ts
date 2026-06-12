import { getDaemonClient } from "../rpc/rpcTransport";
import type { GitChangesBySection } from "../rpc/daemonTypes";
import { workspaceStore } from "../store/workspaceStore";

const inFlightListGitChangesByWorkspaceId = new Map<string, Promise<GitChangesBySection>>();
const inFlightGitAuthorNameByWorkspaceId = new Map<string, Promise<string | null>>();
const gitAuthorNameByWorkspaceId = new Map<string, string | null>();

/** Resolves a workspaceId from store when only a worktreePath is available (repo-root branch listing). */
function resolveWorkspaceIdFromPath(workspaceWorktreePath: string): string {
  const workspace = workspaceStore.getState().workspaces.find((item) => item.worktreePath?.trim() === workspaceWorktreePath);
  if (!workspace?.id) {
    throw new Error(`workspaceId is required for worktree path: ${workspaceWorktreePath}`);
  }
  return workspace.id;
}

/** Reads old/new file content for one workspace diff view. */
export async function readDiff(params: { workspaceId: string; relativePath: string }) {
  const client = await getDaemonClient();
  return client.file.readDiff({
    workspaceId: params.workspaceId,
    relativePath: params.relativePath,
  });
}

/** Reads old/new file content for one specific commit file diff view. */
export async function readCommitDiff(params: {
  workspaceId: string;
  commitHash: string;
  relativePath: string;
}) {
  const client = await getDaemonClient();
  return client.git.readCommitDiff({
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
  const client = await getDaemonClient();
  return client.git.readBranchComparisonDiff({
    workspaceId: params.workspaceId,
    targetBranch: params.targetBranch,
    relativePath: params.relativePath,
  });
}

/** Lists git changes grouped by section for one workspace. */
export async function listGitChanges(params: { workspaceId: string }) {
  const workspaceId = params.workspaceId.trim();
  const inFlightRequest = inFlightListGitChangesByWorkspaceId.get(workspaceId);
  if (inFlightRequest) {
    return await inFlightRequest;
  }

  const request = (async () => {
    const client = await getDaemonClient();
    return await client.git.listChanges({ workspaceId });
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
  const client = await getDaemonClient();
  return client.git.trackChanges({
    workspaceId: params.workspaceId,
    relativePaths: params.relativePaths,
  });
}

/** Unstages one or more changed paths for one workspace. */
export async function unstageGitChanges(params: { workspaceId: string; relativePaths: string[] }) {
  const client = await getDaemonClient();
  return client.git.unstageChanges({
    workspaceId: params.workspaceId,
    relativePaths: params.relativePaths,
  });
}

/** Reverts one or more changed paths for one workspace. */
export async function revertGitChanges(params: { workspaceId: string; relativePaths: string[] }) {
  const client = await getDaemonClient();
  return client.git.revertChanges({
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
  const client = await getDaemonClient();
  return client.git.commitChanges({
    workspaceId: params.workspaceId,
    message: params.message,
    amend: params.amend,
    signoff: params.signoff,
  });
}

/** Reads upstream and ahead/behind status for one workspace branch. */
export async function getGitBranchStatus(params: { workspaceId: string }) {
  const client = await getDaemonClient();
  return client.git.getBranchStatus({ workspaceId: params.workspaceId });
}

/** Lists commits from current branch to one target branch. */
export async function listGitCommitsToTarget(params: {
  workspaceId: string;
  targetBranch: string;
}) {
  const client = await getDaemonClient();
  return client.git.listCommitsToTarget({
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
  const client = await getDaemonClient();
  return client.git.inspect({ workspaceId: params.workspaceId });
}

/** Lists available branch names for one workspace. */
export async function listGitBranches(params: { workspaceId?: string; workspaceWorktreePath?: string }) {
  const workspaceId = params.workspaceId?.trim() || (params.workspaceWorktreePath ? resolveWorkspaceIdFromPath(params.workspaceWorktreePath.trim()) : "");
  if (!workspaceId) {
    throw new Error("workspaceId or workspaceWorktreePath is required");
  }
  const client = await getDaemonClient();
  return client.git.listBranches({ workspaceId });
}

/** Pushes one workspace branch to its upstream. */
export async function pushGitBranch(params: { workspaceId: string }) {
  const client = await getDaemonClient();
  return client.git.pushBranch({ workspaceId: params.workspaceId });
}

/** Publishes one workspace branch and configures upstream tracking. */
export async function publishGitBranch(params: { workspaceId: string }) {
  const client = await getDaemonClient();
  return client.git.publishBranch({ workspaceId: params.workspaceId });
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
    const client = await getDaemonClient();
    return await client.git.getAuthorName({ workspaceId });
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
  const client = await getDaemonClient();
  return client.git.mergePullRequest({
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
  const client = await getDaemonClient();
  return client.git.closePullRequest({
    workspaceId: params.workspaceId,
    prNumber: params.prNumber,
  });
}
