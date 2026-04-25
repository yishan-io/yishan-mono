// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createWorkspaceActions } from "./actions.workspaces";

type TestState = {
  projects: Array<{ id: string; localPath?: string; worktreePath: string }>;
  workspaces: Array<{
    id: string;
    repoId: string;
    name: string;
    title: string;
    sourceBranch: string;
    branch: string;
    summaryId: string;
    worktreePath?: string;
  }>;
  selectedProjectId: string;
  selectedWorkspaceId: string;
  gitChangesCountByWorkspaceId: Record<string, number>;
  gitChangeTotalsByWorkspaceId: Record<string, { additions: number; deletions: number }>;
  gitRefreshVersionByWorktreePath: Record<string, number>;
};

/** Creates a minimal state harness for pure workspace store actions. */
function createHarness() {
  let state: TestState = {
    projects: [
      {
        id: "repo-1",
        localPath: "/tmp/repo-1",
        worktreePath: "/tmp/repo-1",
      },
    ],
    workspaces: [
      {
        id: "workspace-1",
        repoId: "repo-1",
        name: "existing",
        title: "Existing",
        sourceBranch: "main",
        branch: "main",
        summaryId: "workspace-1",
        worktreePath: "/tmp/repo-1/.worktrees/existing",
      },
    ],
    selectedProjectId: "repo-1",
    selectedWorkspaceId: "workspace-1",
    gitChangesCountByWorkspaceId: {},
    gitChangeTotalsByWorkspaceId: {},
    gitRefreshVersionByWorktreePath: {},
  };

  const set = ((updater: Partial<TestState> | ((current: TestState) => Partial<TestState> | TestState)) => {
    const partial = typeof updater === "function" ? updater(state) : updater;
    state = {
      ...state,
      ...partial,
    };
  }) as Parameters<typeof createWorkspaceActions>[0];

  const get = (() => state) as unknown as Parameters<typeof createWorkspaceActions>[1];
  const actions = createWorkspaceActions(set, get);

  return {
    actions,
    getState: () => state,
  };
}

describe("createWorkspaceActions", () => {
  it("adds workspace state and updates selection", () => {
    const harness = createHarness();

    harness.actions.addWorkspace({
      repoId: "repo-1",
      name: "feature-a",
      sourceBranch: "main",
      branch: "feature-a",
      worktreePath: "/tmp/repo-1/.worktrees/feature-a",
      workspaceId: "workspace-2",
    });

    const state = harness.getState();
    expect(state.workspaces.some((workspace) => workspace.id === "workspace-2")).toBe(true);
    expect(state.selectedWorkspaceId).toBe("workspace-2");
  });

  it("renames the matching workspace and updates its title", () => {
    const harness = createHarness();

    harness.actions.renameWorkspace({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      name: "Feature Updated",
    });

    const renamedWorkspace = harness.getState().workspaces.find((workspace) => workspace.id === "workspace-1");
    expect(renamedWorkspace?.name).toBe("Feature Updated");
    expect(renamedWorkspace?.title).toBe("Feature Updated");
  });

  it("renames the matching workspace branch", () => {
    const harness = createHarness();

    harness.actions.renameWorkspaceBranch({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      branch: "feature/updated",
    });

    const renamedWorkspace = harness.getState().workspaces.find((workspace) => workspace.id === "workspace-1");
    expect(renamedWorkspace?.branch).toBe("feature/updated");
  });

  it("deletes one workspace and removes cached git count", () => {
    const harness = createHarness();
    harness.actions.setWorkspaceGitChangesCount("workspace-1", 3);
    harness.actions.setWorkspaceGitChangeTotals("workspace-1", { additions: 7, deletions: 2 });

    harness.actions.deleteWorkspace({
      repoId: "repo-1",
      workspaceId: "workspace-1",
    });

    const state = harness.getState();
    expect(state.workspaces).toHaveLength(0);
    expect(state.gitChangesCountByWorkspaceId["workspace-1"]).toBeUndefined();
    expect(state.gitChangeTotalsByWorkspaceId["workspace-1"]).toBeUndefined();
  });

  it("stores workspace git change counts", () => {
    const harness = createHarness();
    harness.actions.setWorkspaceGitChangesCount("workspace-1", 5);

    expect(harness.getState().gitChangesCountByWorkspaceId["workspace-1"]).toBe(5);
  });

  it("stores workspace git change totals", () => {
    const harness = createHarness();
    harness.actions.setWorkspaceGitChangeTotals("workspace-1", { additions: 12, deletions: 3 });

    expect(harness.getState().gitChangeTotalsByWorkspaceId["workspace-1"]).toEqual({
      additions: 12,
      deletions: 3,
    });
  });

  it("increments workspace git refresh version by worktree path", () => {
    const harness = createHarness();

    harness.actions.incrementGitRefreshVersion("/tmp/repo-1/.worktrees/existing");
    harness.actions.incrementGitRefreshVersion("/tmp/repo-1/.worktrees/existing");

    expect(harness.getState().gitRefreshVersionByWorktreePath["/tmp/repo-1/.worktrees/existing"]).toBe(2);
  });
});
