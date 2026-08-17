import { describe, expect, it } from "vitest";
import {
  applyHydratedStateFromApiData,
  filterVisibleProjects,
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

  it("filters visible projects by display ids while preserving project order", () => {
    expect(
      filterVisibleProjects(
        [
          { id: "repo-1", name: "Repo 1" },
          { id: "repo-2", name: "Repo 2" },
          { id: "repo-3", name: "Repo 3" },
        ],
        ["repo-3", "repo-1"],
      ),
    ).toEqual([
      { id: "repo-1", name: "Repo 1" },
      { id: "repo-3", name: "Repo 3" },
    ]);
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

  it("maps daemon lifecycle state and health onto workspace items", () => {
    const initialState: Parameters<typeof applyHydratedStateFromApiData>[0] = {
      projects: [],
      workspaces: [],
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
          kind: "worktree",
          status: "active",
          state: "error",
          health: "path-missing",
          branch: "feature-a",
          sourceBranch: "main",
          localPath: "/tmp/repo-1/.worktrees/feature-a",
          latestPullRequest: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    );

    const mapped = initialState.workspaces.find((workspace) => workspace.id === "workspace-1");
    expect(mapped?.state).toBe("error");
    expect(mapped?.health).toBe("path-missing");
  });

  it("maps primary workspace display names to local", () => {
    const initialState = {
      projects: [],
      workspaces: [],
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

  it("preserves the optimistic workspace title while API hydration is still provisioning with no path", () => {
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
          name: "abcss",
          title: "abcss",
          sourceBranch: "main",
          branch: "branch-prefix/abcss",
          summaryId: "workspace-2",
          worktreePath: "",
          nodeId: "node-1",
          status: "provisioning" as const,
        },
      ],
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
          status: "provisioning",
          branch: "branch-prefix/abcss",
          sourceBranch: "main",
          localPath: "",
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
          name: "abcss",
          title: "abcss",
          branch: "branch-prefix/abcss",
          status: "provisioning",
        }),
      ]),
    );
  });

  it("preserves completed local workspace state when same-id hydration is weaker", () => {
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
          status: "active" as const,
        },
      ],
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
          status: "provisioning",
          branch: "feature-a",
          sourceBranch: "main",
          localPath: "",
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
          status: "active",
          worktreePath: "/tmp/repo-1/.worktrees/feature-a",
        }),
      ]),
    );
  });

  it("does not resurrect a closed workspace from a stale remote record", () => {
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
      // The close flow removed the workspace optimistically, so it is absent here.
      workspaces: [],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "",
      displayProjectIds: [],
      organizationPreferencesById: {},
    };

    // The daemon overlays the local (closed) status onto the stale remote
    // record (close PATCH failed/lagged), so the snapshot lists the workspace
    // as closed with a real path — the shape that used to resurrect it.
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
          status: "closed",
          branch: "feature-a",
          sourceBranch: "main",
          localPath: "/tmp/repo-1/.worktrees/feature-a",
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

  it("does not downgrade a completed workspace when the snapshot carries the real path but a stale provisioning status", () => {
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
          status: "active" as const,
        },
      ],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-2",
      displayProjectIds: [],
      organizationPreferencesById: {},
    };

    // The daemon overlays the host-local runtime path onto the remote record
    // (listRemoteProjectsWithWorkspaces), so a stale remote status arrives as
    // `provisioning` WITH a real localPath — exactly the shape that previously
    // downgraded the completed workspace back to provisioning (stuck spinner).
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
          status: "provisioning",
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
          status: "active",
          worktreePath: "/tmp/repo-1/.worktrees/feature-a",
        }),
      ]),
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
