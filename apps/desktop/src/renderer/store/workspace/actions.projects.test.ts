import { describe, expect, it } from "vitest";
import { createWorkspaceRepoActions } from "./actions.projects";

type TestState = {
  projects: Array<{
    id: string;
    name: string;
    path: string;
    missing: boolean;
    localPath?: string;
    gitUrl?: string;
    worktreePath: string;
    contextEnabled?: boolean;
    icon?: string;
    color?: string;
    setupScript?: string;
    postScript?: string;
  }>;
  organizationPreferencesById?: Record<
    string,
    {
      selectedProjectId?: string;
      selectedWorkspaceId?: string;
      displayProjectIds?: string[];
    }
  >;
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
  displayProjectIds: string[];
  fileTreeRefreshVersion: number;
  fileTreeChangedRelativePathsByWorktreePath: Record<string, string[]>;
  pullRequestByWorkspaceId: Record<string, unknown>;
  gitChangesCountByWorkspaceId: Record<string, number>;
  gitChangeTotalsByWorkspaceId: Record<string, { additions: number; deletions: number }>;
};

/** Creates a minimal state harness for repo store actions with immer-style mutation. */
function createHarness(overrides?: Partial<TestState>) {
  const state: TestState = {
    organizationPreferencesById: {
      "org-1": {
        selectedProjectId: "repo-1",
        selectedWorkspaceId: "workspace-1",
        displayProjectIds: ["repo-1", "repo-2"],
      },
    },
    projects: [
      {
        id: "repo-1",
        name: "Repo 1",
        path: "/tmp/repo-1",
        missing: false,
        localPath: "/tmp/repo-1",
        gitUrl: "",
        worktreePath: "/tmp/repo-1",
        contextEnabled: true,
        icon: "folder",
        color: "#1E66F5",
        setupScript: "",
        postScript: "",
      },
      {
        id: "repo-2",
        name: "Repo 2",
        path: "/tmp/repo-2",
        missing: false,
        localPath: "/tmp/repo-2",
        gitUrl: "",
        worktreePath: "/tmp/repo-2",
        contextEnabled: true,
        icon: "folder",
        color: "#1E66F5",
        setupScript: "",
        postScript: "",
      },
    ],
    workspaces: [
      {
        id: "workspace-1",
        repoId: "repo-1",
        name: "Feature A",
        title: "Feature A",
        sourceBranch: "main",
        branch: "feature-a",
        summaryId: "workspace-1",
        worktreePath: "/tmp/repo-1/.worktrees/feature-a",
      },
      {
        id: "workspace-2",
        repoId: "repo-2",
        name: "Feature B",
        title: "Feature B",
        sourceBranch: "main",
        branch: "feature-b",
        summaryId: "workspace-2",
        worktreePath: "/tmp/repo-2/.worktrees/feature-b",
      },
    ],
    selectedProjectId: "repo-1",
    selectedWorkspaceId: "workspace-1",
    displayProjectIds: ["repo-1", "repo-2"],
    fileTreeRefreshVersion: 0,
    fileTreeChangedRelativePathsByWorktreePath: {},
    pullRequestByWorkspaceId: {},
    gitChangesCountByWorkspaceId: {
      "workspace-1": 3,
      "workspace-2": 4,
    },
    gitChangeTotalsByWorkspaceId: {
      "workspace-1": { additions: 5, deletions: 2 },
      "workspace-2": { additions: 9, deletions: 4 },
    },
    ...overrides,
  };

  const set = ((updater: ((current: TestState) => void) | Partial<TestState>) => {
    if (typeof updater === "function") {
      updater(state);
    } else {
      Object.assign(state, updater);
    }
  }) as Parameters<typeof createWorkspaceRepoActions>[0];

  const get = (() => state) as unknown as Parameters<typeof createWorkspaceRepoActions>[1];
  const actions = createWorkspaceRepoActions(set, get);

  return {
    actions,
    getState: () => state,
  };
}

describe("createWorkspaceRepoActions", () => {
  it("persists organization-scoped selection + display filter when creating a new project", async () => {
    const { actions, getState } = createHarness({
      projects: [],
      workspaces: [],
      displayProjectIds: [],
      organizationPreferencesById: { "org-1": {} },
    });

    const { sessionStore } = await import("../sessionStore");
    sessionStore.setState({ selectedOrganizationId: "org-1" });

    actions.createProject({
      name: "Repo 1",
      source: "local",
      path: "/tmp/repo-1",
      organizationId: "org-1",
      backendProject: {
        id: "repo-1",
        name: "Repo 1",
        key: "repo-1",
        repoKey: "repo-1",
        localPath: "/tmp/repo-1",
        worktreePath: "/tmp/repo-1",
        gitUrl: "",
        repoUrl: null,
        contextEnabled: true,
        sourceType: "git-local",
        repoProvider: null,
        icon: "folder",
        color: "#1E66F5",
        setupScript: "",
        postScript: "",
        defaultBranch: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        createdByUserId: "user-1",
      },
    });

    const state = getState();
    expect(state.organizationPreferencesById?.["org-1"]).toEqual({
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "",
      displayProjectIds: ["repo-1"],
    });
  });

  it("deletes one project and all child workspace state", () => {
    const harness = createHarness();
    harness.actions.deleteProject("repo-1");

    const state = harness.getState();
    expect(state.projects.map((repo) => repo.id)).toEqual(["repo-2"]);
    expect(state.workspaces.map((workspace) => workspace.id)).toEqual(["workspace-2"]);
    expect(state.selectedProjectId).toBe("repo-2");
    expect(state.selectedWorkspaceId).toBe("workspace-2");
    expect(state.gitChangesCountByWorkspaceId).toEqual({
      "workspace-2": 4,
    });
    expect(state.gitChangeTotalsByWorkspaceId).toEqual({
      "workspace-2": { additions: 9, deletions: 4 },
    });
    expect(state.pullRequestByWorkspaceId).toEqual({});
  });

  it("hydrates state from backend snapshot", () => {
    const harness = createHarness();

    harness.actions.load(
      "org-1",
      [
        {
          id: "repo-1",
          name: "Repo 1",
          sourceType: "git-local",
          repoProvider: "github",
          repoUrl: "https://example.com/acme/repo.git",
          repoKey: "repo-1",
          icon: "folder",
          color: "#1E66F5",
          setupScript: "",
          postScript: "",
          contextEnabled: true,
          organizationId: "org-1",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          createdByUserId: "user-1",
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
          branch: "feature-a",
          sourceBranch: "main",
          localPath: "/tmp/repo-1/.worktrees/feature-a",
          latestPullRequest: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    );

    const state = harness.getState();
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0]?.gitUrl).toBe("https://example.com/acme/repo.git");
    expect(state.displayProjectIds).toEqual(["repo-1"]);
    expect(state.gitChangesCountByWorkspaceId).toEqual({
      "workspace-1": 3,
    });
    expect(state.gitChangeTotalsByWorkspaceId).toEqual({
      "workspace-1": { additions: 5, deletions: 2 },
    });
  });

  it("makes newly discovered backend projects visible after refresh", () => {
    const harness = createHarness();

    harness.actions.load(
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
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          createdByUserId: "user-1",
        },
        {
          id: "repo-3",
          name: "Repo 3",
          sourceType: "git-local",
          repoProvider: null,
          repoUrl: null,
          repoKey: "repo-3",
          icon: "folder",
          color: "#1E66F5",
          setupScript: "",
          postScript: "",
          contextEnabled: true,
          organizationId: "org-1",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          createdByUserId: "user-1",
        },
      ],
      [],
    );

    expect(harness.getState().displayProjectIds).toEqual(["repo-1", "repo-3"]);
    expect(harness.getState().organizationPreferencesById?.["org-1"]?.displayProjectIds).toEqual([
      "repo-1",
      "repo-3",
    ]);
  });

  it("does not re-show projects the user hid on initial hydration", () => {
    const harness = createHarness({
      projects: [],
      workspaces: [],
      displayProjectIds: [],
      organizationPreferencesById: {
        "org-1": {
          selectedProjectId: "repo-1",
          selectedWorkspaceId: "",
          displayProjectIds: ["repo-1"],
        },
      },
    });

    harness.actions.load(
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
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          createdByUserId: "user-1",
        },
        {
          id: "repo-2",
          name: "Repo 2",
          sourceType: "git-local",
          repoProvider: null,
          repoUrl: null,
          repoKey: "repo-2",
          icon: "folder",
          color: "#1E66F5",
          setupScript: "",
          postScript: "",
          contextEnabled: true,
          organizationId: "org-1",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          createdByUserId: "user-1",
        },
      ],
      [],
    );

    expect(harness.getState().displayProjectIds).toEqual(["repo-1"]);
  });

  it("adds project state from backend create result", () => {
    const harness = createHarness({ projects: [], workspaces: [], displayProjectIds: [] });

    harness.actions.createProject({
      name: "Repo 1",
      source: "local",
      path: "/tmp/repo-1",
      organizationId: "org-1",
      backendProject: {
        id: "repo-1",
        name: "Repo 1",
        key: "repo-1",
        repoKey: "repo-1",
        localPath: "/tmp/repo-1",
        worktreePath: "/tmp/repo-1",
        gitUrl: "",
        repoUrl: null,
        contextEnabled: true,
        sourceType: "git-local",
        repoProvider: null,
        icon: "folder",
        color: "#1E66F5",
        setupScript: "",
        postScript: "",
        defaultBranch: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        createdByUserId: "user-1",
      },
    });

    const state = harness.getState();
    expect(state.projects.map((repo) => repo.id)).toEqual(["repo-1"]);
    expect(state.workspaces).toEqual([]);
    expect(state.selectedProjectId).toBe("repo-1");
    expect(state.selectedWorkspaceId).toBe("");
  });

  it("always adds new project to display filter even when some projects are filtered out", () => {
    const harness = createHarness({ displayProjectIds: ["repo-1"] });

    harness.actions.createProject({
      name: "Repo 3",
      source: "local",
      path: "/tmp/repo-3",
      organizationId: "org-1",
      backendProject: {
        id: "repo-3",
        name: "Repo 3",
        key: "repo-3",
        repoKey: "repo-3",
        localPath: "/tmp/repo-3",
        worktreePath: "/tmp/repo-3",
        gitUrl: "",
        repoUrl: null,
        contextEnabled: true,
        sourceType: "git-local",
        repoProvider: null,
        icon: "folder",
        color: "#1E66F5",
        setupScript: "",
        postScript: "",
        defaultBranch: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        createdByUserId: "user-1",
      },
    });

    const state = harness.getState();
    expect(state.displayProjectIds).toEqual(["repo-1", "repo-3"]);
    expect(state.selectedProjectId).toBe("repo-3");
  });

  it("updates project config and refresh version as separate pure actions", () => {
    const harness = createHarness();
    harness.actions.updateProjectConfig("repo-1", {
      name: "Repo Updated",
      worktreePath: "/tmp/repo-1",
      contextEnabled: true,
      icon: "folder",
      color: "#1E66F5",
      setupScript: "npm ci",
      postScript: "rm -rf node_modules",
    });
    harness.actions.incrementFileTreeRefreshVersion();

    const state = harness.getState();
    expect(state.projects[0]?.name).toBe("Repo Updated");
    expect(state.projects[0]?.setupScript).toBe("npm ci");
    expect(state.projects[0]?.postScript).toBe("rm -rf node_modules");
    expect(state.fileTreeRefreshVersion).toBe(1);
  });

  it("ignores git internals when recording changed file-tree paths", () => {
    const harness = createHarness();

    harness.actions.incrementFileTreeRefreshVersion("/tmp/repo-1/.worktrees/feature-a", [
      ".git/worktrees/feature-a",
      "src/app.ts",
    ]);

    expect(harness.getState().fileTreeChangedRelativePathsByWorktreePath).toEqual({
      "/tmp/repo-1/.worktrees/feature-a": ["src/app.ts"],
    });
  });
});
