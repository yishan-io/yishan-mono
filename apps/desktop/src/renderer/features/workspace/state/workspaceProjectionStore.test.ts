// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { workspaceProjectionStore } from "./workspaceProjectionStore";

const initialState = workspaceProjectionStore.getState();

afterEach(() => {
  workspaceProjectionStore.setState(initialState, true);
});

describe("workspaceProjectionStore", () => {
  it("stores git change counts and totals per workspace", () => {
    workspaceProjectionStore.getState().setWorkspaceGitChangesCount("workspace-1", 5);
    workspaceProjectionStore.getState().setWorkspaceGitChangeTotals("workspace-1", { additions: 12, deletions: 3 });

    const state = workspaceProjectionStore.getState();
    expect(state.gitChangesCountByWorkspaceId["workspace-1"]).toBe(5);
    expect(state.gitChangeTotalsByWorkspaceId["workspace-1"]).toEqual({ additions: 12, deletions: 3 });
  });

  it("stores workspace pull request view models", () => {
    workspaceProjectionStore.getState().setWorkspacePullRequest("workspace-1", {
      number: 42,
      title: "PR",
    });

    expect(workspaceProjectionStore.getState().pullRequestByWorkspaceId["workspace-1"]).toEqual({
      number: 42,
      title: "PR",
    });
  });

  it("increments git refresh version by worktree path", () => {
    workspaceProjectionStore.getState().incrementGitRefreshVersion("/tmp/repo-1/.worktrees/existing");
    workspaceProjectionStore.getState().incrementGitRefreshVersion("/tmp/repo-1/.worktrees/existing");

    expect(workspaceProjectionStore.getState().gitRefreshVersionByWorktreePath["/tmp/repo-1/.worktrees/existing"]).toBe(
      2,
    );
  });

  it("prunes projections for removed workspaces", () => {
    workspaceProjectionStore.getState().setWorkspaceGitChangesCount("workspace-1", 3);
    workspaceProjectionStore.getState().setWorkspaceGitChangesCount("workspace-2", 7);
    workspaceProjectionStore.getState().setWorkspacePullRequest("workspace-1", { number: 1 });
    workspaceProjectionStore.getState().setWorkspacePullRequest("workspace-2", { number: 2 });

    workspaceProjectionStore.getState().pruneForWorkspaces(new Set(["workspace-1"]));

    const state = workspaceProjectionStore.getState();
    expect(state.gitChangesCountByWorkspaceId["workspace-1"]).toBe(3);
    expect(state.gitChangesCountByWorkspaceId["workspace-2"]).toBeUndefined();
    expect(state.pullRequestByWorkspaceId["workspace-2"]).toBeUndefined();
  });
});
