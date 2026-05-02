import { getDaemonClient } from "../rpc/rpcTransport";
import type { GitChangesBySection } from "../rpc/daemonTypes";

const inFlightListGitChangesByWorktreePath = new Map<string, Promise<GitChangesBySection>>();
const inFlightGitAuthorNameByWorktreePath = new Map<string, Promise<string | null>>();
const gitAuthorNameByWorktreePath = new Map<string, string | null>();

/** Reads old/new file content for one workspace diff view. */
export async function readDiff(params: { workspaceWorktreePath: string; relativePath: string }) {
  const client = await getDaemonClient();
  return client.file.readDiff({
    workspaceWorktreePath: params.workspaceWorktreePath,
    relativePath: params.relativePath,
  });
}

/** Reads old/new file content for one specific commit file diff view. */
export async function readCommitDiff(params: {
  workspaceWorktreePath: string;
  commitHash: string;
  relativePath: string;
}) {
  const client = await getDaemonClient();
  return client.git.readCommitDiff({
    workspaceWorktreePath: params.workspaceWorktreePath,
    commitHash: params.commitHash,
    relativePath: params.relativePath,
  });
}

/** Reads old/new file content for one target-branch-to-head file diff view. */
export async function readBranchComparisonDiff(params: {
  workspaceWorktreePath: string;
  targetBranch: string;
  relativePath: string;
}) {
  const client = await getDaemonClient();
  return client.git.readBranchComparisonDiff({
    workspaceWorktreePath: params.workspaceWorktreePath,
    targetBranch: params.targetBranch,
    relativePath: params.relativePath,
  });
}

/** Lists git changes grouped by section for one workspace worktree path. */
export async function listGitChanges(params: { workspaceWorktreePath: string }) {
  const normalizedWorkspaceWorktreePath = params.workspaceWorktreePath.trim();
  const inFlightRequest = inFlightListGitChangesByWorktreePath.get(normalizedWorkspaceWorktreePath);
  if (inFlightRequest) {
    return await inFlightRequest;
  }

  const request = (async () => {
    const client = await getDaemonClient();
    return await client.git.listChanges({ workspaceWorktreePath: normalizedWorkspaceWorktreePath });
  })();

  inFlightListGitChangesByWorktreePath.set(normalizedWorkspaceWorktreePath, request);
  try {
    return await request;
  } finally {
    inFlightListGitChangesByWorktreePath.delete(normalizedWorkspaceWorktreePath);
  }
}

/** Stages one or more changed paths for one workspace. */
export async function trackGitChanges(params: { workspaceWorktreePath: string; relativePaths: string[] }) {
  const client = await getDaemonClient();
  return client.git.trackChanges({
    workspaceWorktreePath: params.workspaceWorktreePath,
    relativePaths: params.relativePaths,
  });
}

/** Unstages one or more changed paths for one workspace. */
export async function unstageGitChanges(params: { workspaceWorktreePath: string; relativePaths: string[] }) {
  const client = await getDaemonClient();
  return client.git.unstageChanges({
    workspaceWorktreePath: params.workspaceWorktreePath,
    relativePaths: params.relativePaths,
  });
}

/** Reverts one or more changed paths for one workspace. */
export async function revertGitChanges(params: { workspaceWorktreePath: string; relativePaths: string[] }) {
  const client = await getDaemonClient();
  return client.git.revertChanges({
    workspaceWorktreePath: params.workspaceWorktreePath,
    relativePaths: params.relativePaths,
  });
}

/** Creates one git commit in one workspace. */
export async function commitGitChanges(params: {
  workspaceWorktreePath: string;
  message: string;
  amend?: boolean;
  signoff?: boolean;
}) {
  const client = await getDaemonClient();
  return client.git.commitChanges({
    workspaceWorktreePath: params.workspaceWorktreePath,
    message: params.message,
    amend: params.amend,
    signoff: params.signoff,
  });
}

/** Reads upstream and ahead/behind status for one workspace branch. */
export async function getGitBranchStatus(params: { workspaceWorktreePath: string }) {
  const client = await getDaemonClient();
  return client.git.getBranchStatus({ workspaceWorktreePath: params.workspaceWorktreePath });
}

/** Lists commits from current branch to one target branch. */
export async function listGitCommitsToTarget(params: { workspaceWorktreePath: string; targetBranch: string }) {
  const client = await getDaemonClient();
  return client.git.listCommitsToTarget({
    workspaceWorktreePath: params.workspaceWorktreePath,
    targetBranch: params.targetBranch,
  });
}

/** Inspects a local path for git repository metadata including the current branch. */
export async function inspectGitRepository(params: { path: string }): Promise<{
  isGitRepository: boolean;
  remoteUrl?: string;
  currentBranch?: string;
}> {
  const client = await getDaemonClient();
  return client.git.inspect({ path: params.path });
}

/** Lists available branch names for one workspace. */
export async function listGitBranches(params: { workspaceWorktreePath: string }) {
  const client = await getDaemonClient();
  return client.git.listBranches({ workspaceWorktreePath: params.workspaceWorktreePath });
}

/** Pushes one workspace branch to its upstream. */
export async function pushGitBranch(params: { workspaceWorktreePath: string }) {
  const client = await getDaemonClient();
  return client.git.pushBranch({ workspaceWorktreePath: params.workspaceWorktreePath });
}

/** Publishes one workspace branch and configures upstream tracking. */
export async function publishGitBranch(params: { workspaceWorktreePath: string }) {
  const client = await getDaemonClient();
  return client.git.publishBranch({ workspaceWorktreePath: params.workspaceWorktreePath });
}

/** Reads one repository's resolved git `user.name` value for branch-prefix `Git author` usage. */
export async function getGitAuthorName(params: { workspaceWorktreePath: string }) {
  const normalizedWorkspaceWorktreePath = params.workspaceWorktreePath.trim();
  if (gitAuthorNameByWorktreePath.has(normalizedWorkspaceWorktreePath)) {
    return gitAuthorNameByWorktreePath.get(normalizedWorkspaceWorktreePath) ?? null;
  }

  const inFlightRequest = inFlightGitAuthorNameByWorktreePath.get(normalizedWorkspaceWorktreePath);
  if (inFlightRequest) {
    return await inFlightRequest;
  }

  const request = (async () => {
    const client = await getDaemonClient();
    return await client.git.getAuthorName({ workspaceWorktreePath: normalizedWorkspaceWorktreePath });
  })();

  inFlightGitAuthorNameByWorktreePath.set(normalizedWorkspaceWorktreePath, request);
  try {
    const authorName = (await request) ?? null;
    if (authorName !== null) {
      gitAuthorNameByWorktreePath.set(normalizedWorkspaceWorktreePath, authorName);
    }
    return authorName;
  } finally {
    inFlightGitAuthorNameByWorktreePath.delete(normalizedWorkspaceWorktreePath);
  }
}
