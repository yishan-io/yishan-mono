import { describe, expect, it } from "vitest";
import { applyHydratedStateFromApiData } from "./projectHelpers";

function createProject() {
  return {
    id: "repo-1",
    name: "Repo 1",
    sourceType: "git-local" as const,
    repoProvider: null,
    repoUrl: null,
    repoKey: "repo-1",
    icon: "folder",
    color: "#1E66F5",
    setupScript: "",
    postScript: "",
    contextEnabled: true,
    organizationId: "org-1",
    createdByUserId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createHydrationState() {
  return {
    projects: [
      {
        id: "repo-1",
        name: "Repo 1",
        key: "repo-1",
        path: "/tmp/repo-1",
        missing: false,
        localPath: "/tmp/repo-1",
        worktreePath: "/tmp/repo-1",
      },
    ],
    workspaces: [
      {
        id: "workspace-2",
        organizationId: "org-1",
        projectId: "repo-1",
        repoId: "repo-1",
        name: "feature-a",
        title: "feature-a",
        sourceBranch: "main",
        branch: "feature-a",
        summaryId: "workspace-2",
        worktreePath: "/tmp/repo-1/.worktrees/feature-a",
        nodeId: "node-1",
        status: "active" as const,
        preserveOnMissingSnapshot: true,
      },
    ],
    pullRequestByWorkspaceId: {},
    latestPullRequestByWorkspaceId: {},
    gitChangesCountByWorkspaceId: {},
    gitChangeTotalsByWorkspaceId: {},
    selectedProjectId: "repo-1",
    selectedWorkspaceId: "workspace-2",
    displayProjectIds: [],
    organizationPreferencesById: {},
  };
}

describe("projectHelpers missing snapshot protection", () => {
  it("preserves a protected local workspace when a later snapshot omits it", () => {
    const initialState = createHydrationState();

    applyHydratedStateFromApiData(
      initialState,
      "org-1",
      [createProject()],
      [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "repo-1",
          userId: "user-1",
          nodeId: "node-1",
          kind: "primary",
          status: "active",
          branch: "main",
          sourceBranch: "main",
          localPath: "/tmp/repo-1",
          latestPullRequest: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    );

    expect(initialState.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workspace-2",
          worktreePath: "/tmp/repo-1/.worktrees/feature-a",
          status: "active",
          preserveOnMissingSnapshot: true,
        }),
      ]),
    );
    expect(initialState.selectedWorkspaceId).toBe("workspace-2");
  });

  it("clears missing-snapshot protection once API hydration includes the same workspace id", () => {
    const initialState = createHydrationState();

    applyHydratedStateFromApiData(
      initialState,
      "org-1",
      [createProject()],
      [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "repo-1",
          userId: "user-1",
          nodeId: "node-1",
          kind: "primary",
          status: "active",
          branch: "main",
          sourceBranch: "main",
          localPath: "/tmp/repo-1",
          latestPullRequest: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "workspace-2",
          organizationId: "org-1",
          projectId: "repo-1",
          userId: "user-1",
          nodeId: "node-1",
          kind: "worktree",
          status: "active",
          branch: "feature-a",
          sourceBranch: "main",
          localPath: "/tmp/repo-1/.worktrees/feature-a",
          latestPullRequest: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    );

    expect(initialState.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workspace-2",
          worktreePath: "/tmp/repo-1/.worktrees/feature-a",
          status: "active",
        }),
      ]),
    );
    expect(initialState.workspaces.find((workspace) => workspace.id === "workspace-2")?.preserveOnMissingSnapshot).toBe(
      undefined,
    );
  });
});
