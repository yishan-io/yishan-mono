// @vitest-environment jsdom


import { afterEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "../../project/state/projectStore";
import { workspaceStore } from "../../workspace/state/workspaceStore";
import { refreshWorkspaceGitChanges, refreshWorkspacePullRequest } from "./gitProjectionCommands";

const rpcMocks = vi.hoisted(() => ({
  refreshWorkspacePullRequest: vi.fn(),
  listGitChanges: vi.fn(),
  getBranchDiffSummary: vi.fn(),
  gitInspect: vi.fn(async () => ({ isGitRepository: true })),
}));

vi.mock("../../../domains/workspace/daemon/daemonWorkspaceClient", () => ({
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  getWorkspaceRpc: () =>
    Promise.resolve({
      refreshPullRequest: rpcMocks.refreshWorkspacePullRequest,
    }),
}));

vi.mock("../../../domains/git/daemon/daemonGitClient", () => ({
  getGitRpc: () =>
    Promise.resolve({
      inspectPath: rpcMocks.gitInspect,
      listChanges: rpcMocks.listGitChanges,
      getBranchDiffSummary: rpcMocks.getBranchDiffSummary,
    }),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialProjectionStoreState = gitProjectionStore.getState();
const initialProjectStoreState = projectStore.getState();

afterEach(() => {
  projectStore.setState(initialProjectStoreState, true);
  gitProjectionStore.setState(initialProjectionStoreState, true);
  workspaceStore.setState(initialWorkspaceStoreState, true);
  vi.clearAllMocks();
});

describe("gitProjectionCommands", () => {
  it("does not refresh pull request for a folder workspace (no daemon PR call)", async () => {
    workspaceStore.setState({});
    projectStore.setState({ projects: [] });

    await refreshWorkspacePullRequest("folder-workspace-1");

    expect(rpcMocks.refreshWorkspacePullRequest).not.toHaveBeenCalled();
  });

  it("refreshes one workspace pull request through the daemon", async () => {
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          projectId: "repo-1",
          organizationId: "org-1",
          name: "Workspace 1",
          title: "Workspace 1",
          sourceBranch: "",
          branch: "feature-a",
          summaryId: "summary-1",
          worktreePath: "/tmp/workspaces/workspace-1",
        },
      ],
    });
    rpcMocks.refreshWorkspacePullRequest.mockResolvedValueOnce({
      id: "workspace-1",
      pullRequest: {
        number: 42,
        title: "Add refresh button",
        status: "OPEN",
      },
    });

    await refreshWorkspacePullRequest("workspace-1");

    expect(rpcMocks.refreshWorkspacePullRequest).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    });
    expect(gitProjectionStore.getState().pullRequestByWorkspaceId["workspace-1"]).toEqual({
      number: 42,
      title: "Add refresh button",
      status: "OPEN",
    });
  });

  it("refreshes git changes count through backend service", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Existing",
          title: "Existing",
          summaryId: "",
          sourceBranch: "",
          branch: "feature-a",
          worktreePath: "/tmp/repo-1/.worktrees/existing",
        },
      ],
    });
    gitProjectionStore.setState({
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [{ path: "a.ts", kind: "modified", additions: 1, deletions: 0 }],
      unstaged: [{ path: "b.ts", kind: "modified", additions: 2, deletions: 1 }],
      untracked: [{ path: "c.ts", kind: "added", additions: 0, deletions: 0 }],
    });

    await refreshWorkspaceGitChanges("workspace-1");

    expect(rpcMocks.listGitChanges).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    });
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 3);
    expect(setWorkspaceGitChangeTotals).toHaveBeenCalledWith("workspace-1", {
      additions: 3,
      deletions: 1,
    });
  });

  it("skips git refresh for a folder workspace (no project / no RPC)", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({});
    gitProjectionStore.setState({
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    projectStore.setState({ projects: [] });

    await refreshWorkspaceGitChanges("folder-workspace-1");

    expect(rpcMocks.listGitChanges).not.toHaveBeenCalled();
    expect(rpcMocks.getBranchDiffSummary).not.toHaveBeenCalled();
    expect(setWorkspaceGitChangesCount).not.toHaveBeenCalled();
  });

  it("skips git refresh for a non-git workspace", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({});
    gitProjectionStore.setState({
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    projectStore.setState({ projects: [{ id: "project-plain", name: "Plain", sourceType: "unknown" }] });

    await refreshWorkspaceGitChanges("workspace-1");

    expect(rpcMocks.listGitChanges).not.toHaveBeenCalled();
    expect(rpcMocks.getBranchDiffSummary).not.toHaveBeenCalled();
    expect(setWorkspaceGitChangesCount).not.toHaveBeenCalled();
  });

  it("combines branch diff summary with uncommitted changes when sourceBranch is configured", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
    });
    gitProjectionStore.setState({
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [{ path: "a.ts", kind: "modified", additions: 1, deletions: 0 }],
      unstaged: [],
      untracked: [],
    });
    rpcMocks.getBranchDiffSummary.mockResolvedValueOnce({
      fileCount: 5,
      additions: 40,
      deletions: 10,
      files: ["b.ts", "c.ts", "d.ts", "e.ts", "f.ts"],
    });

    await refreshWorkspaceGitChanges("workspace-1");

    expect(rpcMocks.getBranchDiffSummary).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      targetBranch: "origin/main",
    });
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 6);
    expect(setWorkspaceGitChangeTotals).toHaveBeenCalledWith("workspace-1", {
      additions: 41,
      deletions: 10,
    });
  });

  it("deduplicates overlapping files between branch diff and uncommitted changes", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
    });
    gitProjectionStore.setState({
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [{ path: "a.ts", kind: "modified", additions: 1, deletions: 0 }],
      unstaged: [{ path: "b.ts", kind: "modified", additions: 2, deletions: 1 }],
      untracked: [],
    });
    rpcMocks.getBranchDiffSummary.mockResolvedValueOnce({
      fileCount: 2,
      additions: 40,
      deletions: 10,
      files: ["a.ts", "c.ts"],
    });

    await refreshWorkspaceGitChanges("workspace-1");

    // a.ts appears in both branch diff and staged; b.ts and c.ts are unique. Total unique = 3.
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 3);
  });

  it("reconciles rename-like delete+add pairs so badge matches changes tab count", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
    });
    gitProjectionStore.setState({
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [],
      unstaged: [
        { path: "AGENTS.md", kind: "deleted", additions: 0, deletions: 81 },
        { path: "src/main/ipc.ts", kind: "modified", additions: 1, deletions: 1 },
        { path: "sample.jsonl", kind: "deleted", additions: 0, deletions: 10 },
      ],
      untracked: [
        { path: "AGENTS1.md", kind: "added", additions: 0, deletions: 0 },
        { path: ".superset/config.json", kind: "added", additions: 0, deletions: 0 },
      ],
    });
    rpcMocks.getBranchDiffSummary.mockResolvedValueOnce({
      fileCount: 0,
      additions: 0,
      deletions: 0,
      files: [],
    });

    await refreshWorkspaceGitChanges("workspace-1");

    // AGENTS.md (deleted) + AGENTS1.md (added) reconciled as one rename.
    // sample.jsonl (deleted) should NOT be reconciled with .superset/config.json (different extension/path context).
    // ipc.ts (modified) stays.
    // Total unique after reconciliation = 4.
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 4);
  });

  it("falls back to uncommitted-only count when branch diff summary fails", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
    });
    gitProjectionStore.setState({
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [],
      unstaged: [{ path: "b.ts", kind: "modified", additions: 2, deletions: 1 }],
      untracked: [],
    });
    rpcMocks.getBranchDiffSummary.mockRejectedValueOnce(new Error("target branch not found"));

    await refreshWorkspaceGitChanges("workspace-1");

    // Should fall back to uncommitted-only count
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 1);
    expect(setWorkspaceGitChangeTotals).toHaveBeenCalledWith("workspace-1", {
      additions: 2,
      deletions: 1,
    });
  });

  it("silently ignores transient workspace-not-found git refresh errors", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          sourceBranch: "",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
    });
    gitProjectionStore.setState({
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockRejectedValueOnce(new Error("workspace not found"));

    await refreshWorkspaceGitChanges("workspace-1");

    expect(setWorkspaceGitChangesCount).not.toHaveBeenCalled();
    expect(setWorkspaceGitChangeTotals).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalledWith("Failed to refresh workspace git changes", expect.anything());
    consoleErrorSpy.mockRestore();
  });
});

import { gitProjectionStore } from "../state/gitProjectionStore";