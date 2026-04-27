// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitGitChanges,
  getGitAuthorName,
  getGitBranchStatus,
  listGitBranches,
  listGitChanges,
  listGitCommitsToTarget,
  publishGitBranch,
  pushGitBranch,
  readBranchComparisonDiff,
  readCommitDiff,
  readDiff,
  revertGitChanges,
  trackGitChanges,
  unstageGitChanges,
} from "./gitCommands";

const mocks = vi.hoisted(() => ({
  commitGitChanges: vi.fn(),
  getGitAuthorName: vi.fn(),
  getGitBranchStatus: vi.fn(),
  listGitBranches: vi.fn(),
  listGitChanges: vi.fn(),
  listGitCommitsToTarget: vi.fn(),
  publishGitBranch: vi.fn(),
  pushGitBranch: vi.fn(),
  readBranchComparisonDiff: vi.fn(),
  readCommitDiff: vi.fn(),
  readDiff: vi.fn(),
  revertGitChanges: vi.fn(),
  trackGitChanges: vi.fn(),
  unstageGitChanges: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    file: {
      readDiff: mocks.readDiff,
    },
    git: {
      commitChanges: mocks.commitGitChanges,
      getBranchStatus: mocks.getGitBranchStatus,
      getAuthorName: mocks.getGitAuthorName,
      listBranches: mocks.listGitBranches,
      listChanges: mocks.listGitChanges,
      listCommitsToTarget: mocks.listGitCommitsToTarget,
      publishBranch: mocks.publishGitBranch,
      pushBranch: mocks.pushGitBranch,
      readBranchComparisonDiff: mocks.readBranchComparisonDiff,
      readCommitDiff: mocks.readCommitDiff,
      revertChanges: mocks.revertGitChanges,
      trackChanges: mocks.trackGitChanges,
      unstageChanges: mocks.unstageGitChanges,
    },
  })),
}));

describe("gitCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not cache null git author name results", async () => {
    mocks.getGitAuthorName.mockResolvedValueOnce(null).mockResolvedValueOnce("Alice Chen");

    const firstResult = await getGitAuthorName({ workspaceWorktreePath: "/tmp/repo-null-author" });
    const secondResult = await getGitAuthorName({ workspaceWorktreePath: "/tmp/repo-null-author" });

    expect(firstResult).toBeNull();
    expect(secondResult).toBe("Alice Chen");
    expect(mocks.getGitAuthorName).toHaveBeenCalledTimes(2);
    expect(mocks.getGitAuthorName).toHaveBeenNthCalledWith(1, {
      workspaceWorktreePath: "/tmp/repo-null-author",
    });
    expect(mocks.getGitAuthorName).toHaveBeenNthCalledWith(2, {
      workspaceWorktreePath: "/tmp/repo-null-author",
    });
  });

  it("caches git author name by worktree path", async () => {
    mocks.getGitAuthorName.mockResolvedValue("Alice Chen");

    await getGitAuthorName({ workspaceWorktreePath: "/tmp/repo" });
    await getGitAuthorName({ workspaceWorktreePath: "/tmp/repo " });

    expect(mocks.getGitAuthorName).toHaveBeenCalledTimes(1);
    expect(mocks.getGitAuthorName).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo" });
  });

  it("deduplicates concurrent listGitChanges calls for one worktree", async () => {
    let resolveListChanges: ((value: unknown) => void) | undefined;
    const deferredListChanges = new Promise((resolve) => {
      resolveListChanges = resolve;
    });
    mocks.listGitChanges.mockReturnValueOnce(deferredListChanges);

    const firstRequest = listGitChanges({ workspaceWorktreePath: "/tmp/repo" });
    const secondRequest = listGitChanges({ workspaceWorktreePath: "/tmp/repo" });
    resolveListChanges?.({ unstaged: [], staged: [], untracked: [] });

    await Promise.all([firstRequest, secondRequest]);

    expect(mocks.listGitChanges).toHaveBeenCalledTimes(1);
    expect(mocks.listGitChanges).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo" });
  });

  it("forwards git command requests to git service", async () => {
    await readDiff({ workspaceWorktreePath: "/tmp/repo", relativePath: "a.ts" });
    await readCommitDiff({ workspaceWorktreePath: "/tmp/repo", commitHash: "abc123", relativePath: "a.ts" });
    await readBranchComparisonDiff({ workspaceWorktreePath: "/tmp/repo", targetBranch: "main", relativePath: "a.ts" });
    await listGitChanges({ workspaceWorktreePath: "/tmp/repo" });
    await trackGitChanges({ workspaceWorktreePath: "/tmp/repo", relativePaths: ["a.ts"] });
    await unstageGitChanges({ workspaceWorktreePath: "/tmp/repo", relativePaths: ["a.ts"] });
    await revertGitChanges({ workspaceWorktreePath: "/tmp/repo", relativePaths: ["a.ts"] });
    await commitGitChanges({ workspaceWorktreePath: "/tmp/repo", message: "test" });
    await getGitBranchStatus({ workspaceWorktreePath: "/tmp/repo" });
    await listGitCommitsToTarget({ workspaceWorktreePath: "/tmp/repo", targetBranch: "main" });
    await listGitBranches({ workspaceWorktreePath: "/tmp/repo" });
    await getGitAuthorName({ workspaceWorktreePath: "/tmp/repo-author-forward" });
    await pushGitBranch({ workspaceWorktreePath: "/tmp/repo" });
    await publishGitBranch({ workspaceWorktreePath: "/tmp/repo" });

    expect(mocks.readDiff).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo", relativePath: "a.ts" });
    expect(mocks.readCommitDiff).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/repo",
      commitHash: "abc123",
      relativePath: "a.ts",
    });
    expect(mocks.readBranchComparisonDiff).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/repo",
      targetBranch: "main",
      relativePath: "a.ts",
    });
    expect(mocks.listGitChanges).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo" });
    expect(mocks.trackGitChanges).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo", relativePaths: ["a.ts"] });
    expect(mocks.unstageGitChanges).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/repo",
      relativePaths: ["a.ts"],
    });
    expect(mocks.revertGitChanges).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/repo",
      relativePaths: ["a.ts"],
    });
    expect(mocks.commitGitChanges).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo", message: "test" });
    expect(mocks.getGitBranchStatus).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo" });
    expect(mocks.listGitCommitsToTarget).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/repo",
      targetBranch: "main",
    });
    expect(mocks.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo" });
    expect(mocks.getGitAuthorName).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-author-forward" });
    expect(mocks.pushGitBranch).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo" });
    expect(mocks.publishGitBranch).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo" });
  });
});
