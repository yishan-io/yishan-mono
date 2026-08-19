import { request } from "@renderer/rpc";
import {
  asRecord,
  readOptionalBoolean,
  readOptionalString,
  readOptionalStringArray,
} from "@shared/validation/primitiveReaders";

export type GitWorktreeInput = {
  workspaceId: string;
};

export type GitInspectInput = {
  workspaceId: string;
};

export type GitInspectPathInput = {
  path: string;
};

export type GitPathsInput = {
  workspaceId: string;
  relativePaths: string[];
};

export type GitCommitInput = {
  workspaceId: string;
  message: string;
  amend?: boolean;
  signoff?: boolean;
};

export type GitTargetBranchInput = {
  workspaceId: string;
  targetBranch: string;
};

export type GitCommitDiffInput = {
  workspaceId: string;
  commitHash: string;
  relativePath: string;
};

export type GitBranchDiffInput = {
  workspaceId: string;
  targetBranch: string;
  relativePath: string;
};

export type GitRenameBranchInput = {
  workspaceId: string;
  nextBranch: string;
};

export type GitPrMergeInput = {
  workspaceId: string;
  prNumber: number;
  method?: "merge" | "squash" | "rebase";
  deleteBranch?: boolean;
};

export type GitPrCloseInput = {
  workspaceId: string;
  prNumber: number;
};

export type GitChange = {
  path: string;
  kind: string;
  additions: number;
  deletions: number;
};

export type GitChangesBySection = {
  unstaged: GitChange[];
  staged: GitChange[];
  untracked: GitChange[];
};

export type GitStatusOperationResponse = {
  tracked?: boolean;
  unstaged?: boolean;
  reverted?: boolean;
  renamed?: boolean;
};

export type GitInspectResponse = {
  isGitRepository: boolean;
  remoteUrl?: string;
  currentBranch?: string;
};

export type GitBranchStatusResponse = {
  hasUpstream: boolean;
  aheadCount: number;
};

export type GitCommitFile = {
  path: string;
  oldPath?: string;
  status: string; // "A" | "M" | "D" | "R" | "C" | ...
};

export type GitCommit = {
  hash: string;
  shortHash: string;
  authorName: string;
  committedAt: string;
  subject: string;
  changedFiles: GitCommitFile[];
};

export type GitCommitComparisonResponse = {
  currentBranch: string;
  targetBranch: string;
  allChangedFiles: GitCommitFile[];
  commits: GitCommit[];
};

export type GitBranchDiffSummaryResponse = {
  fileCount: number;
  additions: number;
  deletions: number;
  files: string[];
};

export type GitDiffContentResponse = {
  oldContent: string;
  newContent: string;
};

export type GitBranchListResponse = {
  currentBranch: string;
  branches: string[];
  localBranches?: string[];
  remoteBranches?: string[];
  worktreeBranches?: string[];
};

/**
 * Git wire DTOs (desktop7 Phase 25). Owned by the Git Domain Infrastructure;
 * the daemon payload shapes are the transport contract.
 */

type InvokeFn = (method: string, params?: unknown) => Promise<unknown>;

function readRequiredWorkspaceId(input: unknown): string {
  const workspaceId = readOptionalString(asRecord(input)?.workspaceId);
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }
  return workspaceId;
}

/** Git namespace methods for the daemon RPC client. */
export class DaemonGitClient {
  private readonly invoke: InvokeFn;

  constructor(invoke: InvokeFn) {
    this.invoke = invoke;
  }

  async listChanges(input: GitWorktreeInput): Promise<GitChangesBySection> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.listChanges", { workspaceId })) as GitChangesBySection;
  }

  async inspect(input: GitInspectInput): Promise<GitInspectResponse> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.inspect", { workspaceId })) as GitInspectResponse;
  }

  async inspectPath(input: GitInspectPathInput): Promise<GitInspectResponse> {
    const record = asRecord(input);
    const path = readOptionalString(record?.path);
    if (!path) {
      throw new Error("path is required");
    }
    return (await this.invoke("git.inspectPath", { path })) as GitInspectResponse;
  }

  async trackChanges(input: GitPathsInput): Promise<GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.track", {
      workspaceId,
      paths: readOptionalStringArray(record?.relativePaths) ?? [],
    })) as GitStatusOperationResponse;
  }

  async unstageChanges(input: GitPathsInput): Promise<GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.unstage", {
      workspaceId,
      paths: readOptionalStringArray(record?.relativePaths) ?? [],
    })) as GitStatusOperationResponse;
  }

  async revertChanges(input: GitPathsInput): Promise<GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.revert", {
      workspaceId,
      paths: readOptionalStringArray(record?.relativePaths) ?? [],
    })) as GitStatusOperationResponse;
  }

  async commitChanges(input: GitCommitInput): Promise<string> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.commit", {
      workspaceId,
      message: readOptionalString(record?.message) || "",
      amend: readOptionalBoolean(record?.amend),
      signoff: readOptionalBoolean(record?.signoff),
    })) as string;
  }

  async getBranchStatus(input: GitWorktreeInput): Promise<GitBranchStatusResponse> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.branchStatus", { workspaceId })) as GitBranchStatusResponse;
  }

  async listCommitsToTarget(input: GitTargetBranchInput): Promise<GitCommitComparisonResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    const targetBranch = readOptionalString(record?.targetBranch);
    if (!targetBranch) {
      throw new Error("targetBranch is required");
    }
    return (await this.invoke("git.commitsToTarget", {
      workspaceId,
      targetBranch,
    })) as GitCommitComparisonResponse;
  }

  async getBranchDiffSummary(input: GitTargetBranchInput): Promise<GitBranchDiffSummaryResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    const targetBranch = readOptionalString(record?.targetBranch);
    if (!targetBranch) {
      throw new Error("targetBranch is required");
    }
    return (await this.invoke("git.branchDiffSummary", {
      workspaceId,
      targetBranch,
    })) as GitBranchDiffSummaryResponse;
  }

  async readCommitDiff(input: GitCommitDiffInput): Promise<GitDiffContentResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    const commitHash = readOptionalString(record?.commitHash);
    const relativePath = readOptionalString(record?.relativePath);
    if (!commitHash || !relativePath) {
      throw new Error("commitHash and relativePath are required");
    }
    return (await this.invoke("git.commitDiff", {
      workspaceId,
      commitHash,
      path: relativePath,
    })) as GitDiffContentResponse;
  }

  async readBranchComparisonDiff(input: GitBranchDiffInput): Promise<GitDiffContentResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    const targetBranch = readOptionalString(record?.targetBranch);
    const relativePath = readOptionalString(record?.relativePath);
    if (!targetBranch || !relativePath) {
      throw new Error("targetBranch and relativePath are required");
    }
    return (await this.invoke("git.branchDiff", {
      workspaceId,
      targetBranch,
      path: relativePath,
    })) as GitDiffContentResponse;
  }

  async listBranches(input: GitWorktreeInput): Promise<GitBranchListResponse> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.branches", { workspaceId })) as GitBranchListResponse;
  }

  async pushBranch(input: GitWorktreeInput): Promise<string> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.push", { workspaceId })) as string;
  }

  async publishBranch(input: GitWorktreeInput): Promise<string> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.publish", { workspaceId })) as string;
  }

  async renameBranch(input: GitRenameBranchInput): Promise<GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    const nextBranch = readOptionalString(record?.nextBranch);
    if (!nextBranch) {
      throw new Error("nextBranch is required");
    }
    return (await this.invoke("git.renameBranch", { workspaceId, nextBranch })) as GitStatusOperationResponse;
  }

  async getAuthorName(input: GitWorktreeInput): Promise<string> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.authorName", { workspaceId })) as string;
  }

  async mergePullRequest(input: GitPrMergeInput): Promise<{ output: string }> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    const prNumber = record?.prNumber;
    if (typeof prNumber !== "number" || prNumber <= 0) {
      throw new Error("prNumber is required");
    }
    return (await this.invoke("git.prMerge", {
      workspaceId,
      prNumber,
      method: readOptionalString(record?.method),
      deleteBranch: readOptionalBoolean(record?.deleteBranch),
    })) as { output: string };
  }

  async closePullRequest(input: GitPrCloseInput): Promise<{ output: string }> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    const prNumber = record?.prNumber;
    if (typeof prNumber !== "number" || prNumber <= 0) {
      throw new Error("prNumber is required");
    }
    return (await this.invoke("git.prClose", {
      workspaceId,
      prNumber,
    })) as { output: string };
  }
}

let cachedGitRpc: DaemonGitClient | null = null;

/**
 * Lazily resolves the git Domain RPC adapter over the root transport
 * (dependency direction: Domain RPC adapter → root RPC transport).
 */
export async function getGitRpc(): Promise<DaemonGitClient> {
  if (!cachedGitRpc) {
    cachedGitRpc = new DaemonGitClient(request);
  }
  return cachedGitRpc;
}
