import { describe, expect, it } from "vitest";
import {
  applyHydratedStateFromApiData,
  normalizeCreateRepoInput,
  readPersistedWorkspacePreferencesByOrg,
} from "./projectHelpers";

describe("projectHelpers", () => {
  it("normalizes create-repo input based on source", () => {
    expect(
      normalizeCreateRepoInput({
        source: "local",
        path: "  /tmp/repo  ",
        gitUrl: "  https://example.com/repo.git  ",
      }),
    ).toEqual({
      normalizedPath: "/tmp/repo",
      normalizedGitUrl: "https://example.com/repo.git",
      resolvedPath: "/tmp/repo",
    });

    expect(
      normalizeCreateRepoInput({
        source: "remote",
        path: "  /fallback/path  ",
        gitUrl: " https://example.com/repo.git ",
      }),
    ).toEqual({
      normalizedPath: "/fallback/path",
      normalizedGitUrl: "https://example.com/repo.git",
      resolvedPath: "https://example.com/repo.git",
    });
  });

  it("reads persisted organization workspace preferences and ignores invalid payloads", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          state: {
            organizationPreferencesById: {
              "org-1": {
                displayProjectIds: ["repo-1", "repo-2", 3],
              },
            },
          },
        }),
    } as unknown as Storage;

    expect(readPersistedWorkspacePreferencesByOrg(storage, "org-1")).toEqual({
      displayProjectIds: ["repo-1", "repo-2"],
      knownProjectIds: undefined,
      lastUsedExternalAppId: undefined,
    });

    const invalidStorage = {
      getItem: () => "not json",
    } as unknown as Storage;

    expect(readPersistedWorkspacePreferencesByOrg(invalidStorage, "org-1")).toBeUndefined();
  });

  it("falls back to showing all repos when persisted display ids are stale", () => {
    const initialState = {
      projects: [],
      workspaces: [],
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      gitChangesCountByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
      selectedProjectId: "",
      selectedWorkspaceId: "",
      displayProjectIds: [],
      organizationPreferencesById: {
        "org-1": {
          displayProjectIds: ["missing-repo-id"],
        },
      },
    };

    applyHydratedStateFromApiData(
      initialState,
      "org-1",
      [
        {
          id: "repo-1",
          name: "Repo 1",
          sourceType: "git-local",
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
        },
      ],
      [],
    );

    expect(initialState.displayProjectIds).toEqual(["repo-1"]);
  });

  it("defaults to all projects when persisted display ids are empty", () => {
    const initialState = {
      projects: [],
      workspaces: [],
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      gitChangesCountByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
      selectedProjectId: "",
      selectedWorkspaceId: "",
      displayProjectIds: [],
      organizationPreferencesById: {
        "org-1": {
          displayProjectIds: [],
        },
      },
    };

    applyHydratedStateFromApiData(
      initialState,
      "org-1",
      [
        {
          id: "repo-1",
          name: "Repo 1",
          sourceType: "git-local",
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
        },
      ],
      [],
    );

    expect(initialState.displayProjectIds).toEqual(["repo-1"]);
  });

  it("keeps empty display ids when no projects exist", () => {
    const initialState = {
      projects: [],
      workspaces: [],
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      gitChangesCountByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
      selectedProjectId: "",
      selectedWorkspaceId: "",
      displayProjectIds: [],
      organizationPreferencesById: {
        "org-1": {
          displayProjectIds: [],
        },
      },
    };

    applyHydratedStateFromApiData(initialState, "org-1", [], []);

    expect(initialState.displayProjectIds).toEqual([]);
  });

  it("preserves the selected workspace when hydration includes it", () => {
    const initialState = {
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
          worktreePath: "",
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

    applyHydratedStateFromApiData(
      initialState,
      "org-1",
      [
        {
          id: "repo-1",
          name: "Repo 1",
          sourceType: "git-local",
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
        },
      ],
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

    expect(initialState.selectedProjectId).toBe("repo-1");
    expect(initialState.selectedWorkspaceId).toBe("workspace-2");
  });

  it("maps primary workspace display names to local", () => {
    const initialState = {
      projects: [],
      workspaces: [],
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      gitChangesCountByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
      selectedProjectId: "",
      selectedWorkspaceId: "",
      displayProjectIds: [],
      organizationPreferencesById: {},
    };

    applyHydratedStateFromApiData(
      initialState,
      "org-1",
      [
        {
          id: "repo-1",
          name: "Repo 1",
          sourceType: "git-local",
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
        },
      ],
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

    expect(initialState.workspaces?.[0]).toEqual(
      expect.objectContaining({
        id: "workspace-1",
        name: "local",
        title: "local",
        branch: "main",
      }),
    );
  });

  it("does not preserve completed local workspaces that are absent from the snapshot", () => {
    const initialState = {
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

    applyHydratedStateFromApiData(
      initialState,
      "org-1",
      [
        {
          id: "repo-1",
          name: "Repo 1",
          sourceType: "git-local",
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
        },
      ],
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

    expect(initialState.workspaces).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workspace-2",
        }),
      ]),
    );
  });
});
