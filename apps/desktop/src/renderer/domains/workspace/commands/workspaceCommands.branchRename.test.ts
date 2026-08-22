// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { renameWorkspaceBranch } from "./workspaceCommands";

const rpcMocks = vi.hoisted(() => ({ renameGitBranch: vi.fn() }));

vi.mock("../../../domains/git/daemon/daemonGitClient", () => ({
  getGitRpc: () => Promise.resolve({ renameBranch: rpcMocks.renameGitBranch }),
}));

const initialWorkspaceStoreState = workspaceStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
  vi.clearAllMocks();
});

describe("workspace branch rename command", () => {
  it("renames one managed workspace branch through backend and store", async () => {
    const renameWorkspaceBranchState = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "workspace-1",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
          kind: "managed",
        },
      ],
      renameWorkspaceBranch: renameWorkspaceBranchState,
    });
    rpcMocks.renameGitBranch.mockResolvedValueOnce({ ok: true });

    await renameWorkspaceBranch({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      branch: "feature-b",
    });

    expect(rpcMocks.renameGitBranch).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      nextBranch: "feature-b",
    });
    expect(renameWorkspaceBranchState).toHaveBeenCalledWith({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      branch: "feature-b",
    });
  });

  it("does not rename branch for local workspaces", async () => {
    const renameWorkspaceBranchState = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "local",
          title: "local",
          summaryId: "workspace-1",
          sourceBranch: "main",
          branch: "main",
          worktreePath: "/tmp/repo-1",
          kind: "local",
        },
      ],
      renameWorkspaceBranch: renameWorkspaceBranchState,
    });

    await renameWorkspaceBranch({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      branch: "feature-b",
    });

    expect(rpcMocks.renameGitBranch).not.toHaveBeenCalled();
    expect(renameWorkspaceBranchState).not.toHaveBeenCalled();
  });

  it("throws when backend branch rename fails", async () => {
    const renameWorkspaceBranchState = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "workspace-1",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
          kind: "managed",
        },
      ],
      renameWorkspaceBranch: renameWorkspaceBranchState,
    });
    rpcMocks.renameGitBranch.mockRejectedValueOnce(new Error("rename failed"));

    await expect(
      renameWorkspaceBranch({
        repoId: "repo-1",
        workspaceId: "workspace-1",
        branch: "feature-b",
      }),
    ).rejects.toThrow("rename failed");
    expect(renameWorkspaceBranchState).not.toHaveBeenCalled();
  });
});
