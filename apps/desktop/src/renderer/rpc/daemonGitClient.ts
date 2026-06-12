import type * as Rpc from "./daemonTypes";
import {
  asRecord,
  readOptionalBoolean,
  readOptionalString,
  readOptionalStringArray,
} from "./helpers";

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

  async listChanges(input: Rpc.GitWorktreeInput): Promise<Rpc.GitChangesBySection> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.listChanges", { workspaceId })) as Rpc.GitChangesBySection;
  }

  async inspect(input: Rpc.GitInspectInput): Promise<Rpc.GitInspectResponse> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.inspect", { workspaceId })) as Rpc.GitInspectResponse;
  }

  async inspectPath(input: Rpc.GitInspectPathInput): Promise<Rpc.GitInspectResponse> {
    const record = asRecord(input);
    const path = readOptionalString(record?.path);
    if (!path) {
      throw new Error("path is required");
    }
    return (await this.invoke("git.inspectPath", { path })) as Rpc.GitInspectResponse;
  }

  async trackChanges(input: Rpc.GitPathsInput): Promise<Rpc.GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.track", {
      workspaceId,
      paths: readOptionalStringArray(record?.relativePaths) ?? [],
    })) as Rpc.GitStatusOperationResponse;
  }

  async unstageChanges(input: Rpc.GitPathsInput): Promise<Rpc.GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.unstage", {
      workspaceId,
      paths: readOptionalStringArray(record?.relativePaths) ?? [],
    })) as Rpc.GitStatusOperationResponse;
  }

  async revertChanges(input: Rpc.GitPathsInput): Promise<Rpc.GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.revert", {
      workspaceId,
      paths: readOptionalStringArray(record?.relativePaths) ?? [],
    })) as Rpc.GitStatusOperationResponse;
  }

  async commitChanges(input: Rpc.GitCommitInput): Promise<string> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.commit", {
      workspaceId,
      message: readOptionalString(record?.message) || "",
      amend: readOptionalBoolean(record?.amend),
      signoff: readOptionalBoolean(record?.signoff),
    })) as string;
  }

  async getBranchStatus(input: Rpc.GitWorktreeInput): Promise<Rpc.GitBranchStatusResponse> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.branchStatus", { workspaceId })) as Rpc.GitBranchStatusResponse;
  }

  async listCommitsToTarget(input: Rpc.GitTargetBranchInput): Promise<Rpc.GitCommitComparisonResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    const targetBranch = readOptionalString(record?.targetBranch);
    if (!targetBranch) {
      throw new Error("targetBranch is required");
    }
    return (await this.invoke("git.commitsToTarget", {
      workspaceId,
      targetBranch,
    })) as Rpc.GitCommitComparisonResponse;
  }

  async getBranchDiffSummary(input: Rpc.GitTargetBranchInput): Promise<Rpc.GitBranchDiffSummaryResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    const targetBranch = readOptionalString(record?.targetBranch);
    if (!targetBranch) {
      throw new Error("targetBranch is required");
    }
    return (await this.invoke("git.branchDiffSummary", {
      workspaceId,
      targetBranch,
    })) as Rpc.GitBranchDiffSummaryResponse;
  }

  async readCommitDiff(input: Rpc.GitCommitDiffInput): Promise<Rpc.GitDiffContentResponse> {
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
    })) as Rpc.GitDiffContentResponse;
  }

  async readBranchComparisonDiff(input: Rpc.GitBranchDiffInput): Promise<Rpc.GitDiffContentResponse> {
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
    })) as Rpc.GitDiffContentResponse;
  }

  async listBranches(input: Rpc.GitWorktreeInput): Promise<Rpc.GitBranchListResponse> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.branches", { workspaceId })) as Rpc.GitBranchListResponse;
  }

  async pushBranch(input: Rpc.GitWorktreeInput): Promise<string> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.push", { workspaceId })) as string;
  }

  async publishBranch(input: Rpc.GitWorktreeInput): Promise<string> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.publish", { workspaceId })) as string;
  }

  async renameBranch(input: Rpc.GitRenameBranchInput): Promise<Rpc.GitStatusOperationResponse> {
    const record = asRecord(input);
    const workspaceId = readRequiredWorkspaceId(input);
    const nextBranch = readOptionalString(record?.nextBranch);
    if (!nextBranch) {
      throw new Error("nextBranch is required");
    }
    return (await this.invoke("git.renameBranch", { workspaceId, nextBranch })) as Rpc.GitStatusOperationResponse;
  }

  async getAuthorName(input: Rpc.GitWorktreeInput): Promise<string> {
    const workspaceId = readRequiredWorkspaceId(input);
    return (await this.invoke("git.authorName", { workspaceId })) as string;
  }

  async mergePullRequest(input: Rpc.GitPrMergeInput): Promise<{ output: string }> {
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

  async closePullRequest(input: Rpc.GitPrCloseInput): Promise<{ output: string }> {
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
