import { describe, expect, it } from "vitest";
import {
  applyCreatedWorkspaceState,
  countWorkspaceGitChanges,
  normalizeCreateWorkspaceInput,
} from "./workspaceHelpers";

describe("workspaceHelpers", () => {
  it("normalizes create-workspace input and applies defaults", () => {
    expect(
      normalizeCreateWorkspaceInput({
        name: "  feature-a  ",
      }),
    ).toEqual({
      normalizedName: "feature-a",
      normalizedBranch: "main",
    });
  });

  it("counts changes across staged, unstaged, and untracked sections", () => {
    expect(
      countWorkspaceGitChanges({
        staged: [{ path: "a.ts" }],
        unstaged: [{ path: "b.ts" }, { path: "c.ts" }],
        untracked: [{ path: "d.ts" }],
      }),
    ).toBe(4);
  });

  it("updates existing optimistic workspace when backend details arrive", () => {
    const state = {
      projects: [{ id: "repo-1", worktreePath: "/tmp/repo-1" }],
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "feature-a",
          title: "feature-a",
          sourceBranch: "main",
          branch: "feature-a",
          summaryId: "workspace-1",
          worktreePath: "",
        },
      ],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-1",
      pullRequestByWorkspaceId: {},
      gitChangesCountByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
    };

    applyCreatedWorkspaceState(state, {
      projectId: "repo-1",
      normalizedName: "feature-a",
      normalizedBranch: "feature-a",
      backendWorkspace: {
        workspaceId: "workspace-1",
        name: "feature-a",
        sourceBranch: "main",
        branch: "feature-a",
        worktreePath: "/tmp/worktrees/feature-a",
      },
    });

    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces?.[0]?.worktreePath).toBe("/tmp/worktrees/feature-a");
  });
});
