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

    const firstResult = await getGitAuthorName({ workspaceId: "workspace-null-author" });
    const secondResult = await getGitAuthorName({ workspaceId: "workspace-null-author" });

    expect(firstResult).toBeNull();
    expect(secondResult).toBe("Alice Chen");
    expect(mocks.getGitAuthorName).toHaveBeenCalledTimes(2);
    expect(mocks.getGitAuthorName).toHaveBeenNthCalledWith(1, { workspaceId: "workspace-null-author" });
    expect(mocks.getGitAuthorName).toHaveBeenNthCalledWith(2, { workspaceId: "workspace-null-author" });
  });

  it("caches git author name by worktree path", async () => {
    mocks.getGitAuthorName.mockResolvedValue("Alice Chen");

    await getGitAuthorName({ workspaceId: "workspace-1" });
    await getGitAuthorName({ workspaceId: "workspace-1 " });

    expect(mocks.getGitAuthorName).toHaveBeenCalledTimes(1);
    expect(mocks.getGitAuthorName).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
  });

  it("deduplicates concurrent listGitChanges calls for one worktree", async () => {
    let resolveListChanges: ((value: unknown) => void) | undefined;
    const deferredListChanges = new Promise((resolve) => {
      resolveListChanges = resolve;
    });
    mocks.listGitChanges.mockReturnValueOnce(deferredListChanges);

    const firstRequest = listGitChanges({ workspaceId: "workspace-1" });
    const secondRequest = listGitChanges({ workspaceId: "workspace-1" });
    resolveListChanges?.({ unstaged: [], staged: [], untracked: [] });

    await Promise.all([firstRequest, secondRequest]);

    expect(mocks.listGitChanges).toHaveBeenCalledTimes(1);
    expect(mocks.listGitChanges).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
  });

  it("forwards git command requests to git service", async () => {
    await readDiff({ workspaceId: "workspace-1", relativePath: "a.ts" });
    await readCommitDiff({ workspaceId: "workspace-1", commitHash: "abc123", relativePath: "a.ts" });
    await readBranchComparisonDiff({ workspaceId: "workspace-1", targetBranch: "main", relativePath: "a.ts" });
    await listGitChanges({ workspaceId: "workspace-1" });
    await trackGitChanges({ workspaceId: "workspace-1", relativePaths: ["a.ts"] });
    await unstageGitChanges({ workspaceId: "workspace-1", relativePaths: ["a.ts"] });
    await revertGitChanges({ workspaceId: "workspace-1", relativePaths: ["a.ts"] });
    await commitGitChanges({ workspaceId: "workspace-1", message: "test" });
    await getGitBranchStatus({ workspaceId: "workspace-1" });
    await listGitCommitsToTarget({ workspaceId: "workspace-1", targetBranch: "main" });
    await listGitBranches({ workspaceId: "workspace-1" });
    await getGitAuthorName({ workspaceId: "workspace-author-forward" });
    await pushGitBranch({ workspaceId: "workspace-1" });
    await publishGitBranch({ workspaceId: "workspace-1" });

    expect(mocks.readDiff).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePath: "a.ts" });
    expect(mocks.readCommitDiff).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      commitHash: "abc123",
      relativePath: "a.ts",
    });
    expect(mocks.readBranchComparisonDiff).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      targetBranch: "main",
      relativePath: "a.ts",
    });
    expect(mocks.listGitChanges).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(mocks.trackGitChanges).toHaveBeenCalledWith({ workspaceId: "workspace-1", relativePaths: ["a.ts"] });
    expect(mocks.unstageGitChanges).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePaths: ["a.ts"],
    });
    expect(mocks.revertGitChanges).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePaths: ["a.ts"],
    });
    expect(mocks.commitGitChanges).toHaveBeenCalledWith({ workspaceId: "workspace-1", message: "test" });
    expect(mocks.getGitBranchStatus).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(mocks.listGitCommitsToTarget).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      targetBranch: "main",
    });
    expect(mocks.listGitBranches).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(mocks.getGitAuthorName).toHaveBeenCalledWith({ workspaceId: "workspace-author-forward" });
    expect(mocks.pushGitBranch).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(mocks.publishGitBranch).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
  });
});
