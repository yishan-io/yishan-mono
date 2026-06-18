// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../store/chatStore";
import { sessionStore } from "../store/sessionStore";
import { workspaceSettingsStore } from "../store/settings/workspaceSettingsStore";
import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";
import { createProject, deleteProject, loadWorkspaceSnapshot, updateProjectConfig } from "./projectCommands";

const apiMocks = vi.hoisted(() => ({
  listOrganizations: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  updateProject: vi.fn(),
  listOrganizationNodes: vi.fn(),
}));

vi.mock("../api", () => ({
  api: {
    org: {
      list: apiMocks.listOrganizations,
    },
    project: {
      listByOrg: apiMocks.listProjects,
      create: apiMocks.createProject,
      delete: apiMocks.deleteProject,
      update: apiMocks.updateProject,
    },
    node: {
      listByOrg: apiMocks.listOrganizationNodes,
    },
  },
}));

const rpcMocks = vi.hoisted(() => ({
  gitInspect: vi.fn(
    async () => ({ isGitRepository: true }) as { isGitRepository: boolean; remoteUrl?: string; currentBranch?: string },
  ),
  workspaceList: vi.fn(async () => []),
  workspaceSyncContextLink: vi.fn(async () => ({ updated: [], skipped: [], errors: {} })),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    git: {
      inspectPath: rpcMocks.gitInspect,
    },
    workspace: {
      list: rpcMocks.workspaceList,
      syncContextLink: rpcMocks.workspaceSyncContextLink,
    },
  })),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialTabStoreState = tabStore.getState();
const initialChatStoreState = chatStore.getState();
const initialSessionStoreState = sessionStore.getState();
const initialWorkspaceSettingsStoreState = workspaceSettingsStore.getState();

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

afterEach(() => {
  localStorage.clear();
  workspaceStore.setState(initialWorkspaceStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  chatStore.setState(initialChatStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  workspaceSettingsStore.setState(initialWorkspaceSettingsStoreState, true);
  vi.clearAllMocks();
});

describe("projectCommands", () => {
  it("loads backend snapshot and hydrates store", async () => {
    const hydrate = vi.fn();
    const retainWorkspaceTabs = vi.fn().mockReturnValue([]);
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ retainWorkspaceTabs, resolveTabForWorkspace });
    workspaceStore.setState({ load: hydrate });
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      loaded: true,
    });
    apiMocks.listProjects.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "Project 1",
        sourceType: "git",
        repoProvider: "github",
        repoUrl: "https://github.com/test/project-1.git",
        repoKey: "project-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdByUserId: "user-1",
        workspaces: [],
      },
    ]);

    await loadWorkspaceSnapshot();

    expect(apiMocks.listProjects).toHaveBeenCalledWith("org-1", { withWorkspaces: true });
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(hydrate.mock.calls[0]?.[0]).toBe("org-1");
    expect(hydrate.mock.calls[0]?.[1]).toEqual([
      {
        id: "project-1",
        name: "Project 1",
        sourceType: "git",
        repoProvider: "github",
        repoUrl: "https://github.com/test/project-1.git",
        repoKey: "project-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdByUserId: "user-1",
      },
    ]);
    expect(hydrate.mock.calls[0]?.[2]).toEqual([]);
    expect(retainWorkspaceTabs).toHaveBeenCalledTimes(1);
    expect(resolveTabForWorkspace).toHaveBeenCalledTimes(1);
  });

  it("loads visible hydrated workspaces without reopening them in daemon", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      daemonId: "node-1",
      loaded: true,
    });
    workspaceStore.setState({
      displayProjectIds: ["project-1"],
    });
    apiMocks.listProjects.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "Project 1",
        sourceType: "git",
        repoProvider: "github",
        repoUrl: "https://github.com/test/project-1.git",
        repoKey: "project-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdByUserId: "user-1",
        workspaces: [
          {
            id: "workspace-1",
            organizationId: "org-1",
            projectId: "project-1",
            userId: "user-1",
            nodeId: "node-1",
            kind: "worktree",
            status: "active",
            branch: "feature-a",
            sourceBranch: "main",
            localPath: "/tmp/workspaces/project-1/feature-a",
            latestPullRequest: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ]);

    await loadWorkspaceSnapshot();

    expect(rpcMocks.workspaceList).not.toHaveBeenCalled();
  });

  it("does not open visible hydrated workspaces from another node", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      daemonId: "node-1",
      loaded: true,
    });
    workspaceStore.setState({
      displayProjectIds: ["project-1"],
    });
    apiMocks.listProjects.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "Project 1",
        sourceType: "git",
        repoProvider: "github",
        repoUrl: "https://github.com/test/project-1.git",
        repoKey: "project-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdByUserId: "user-1",
        workspaces: [
          {
            id: "workspace-remote",
            organizationId: "org-1",
            projectId: "project-1",
            userId: "user-1",
            nodeId: "node-2",
            kind: "worktree",
            status: "active",
            branch: "feature-a",
            sourceBranch: "main",
            localPath: "/tmp/workspaces/project-1/feature-a",
            latestPullRequest: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ]);

    await loadWorkspaceSnapshot();

    expect(rpcMocks.workspaceList).not.toHaveBeenCalled();
  });

  it("ignores stale overlapping snapshot responses that would remove a visible workspace", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      loaded: true,
    });

    const olderSnapshot =
      createDeferredPromise<
        Array<{
          id: string;
          name: string;
          sourceType: "git";
          repoProvider: string;
          repoUrl: string;
          repoKey: string;
          createdAt: string;
          updatedAt: string;
          createdByUserId: string;
          workspaces: Array<Record<string, unknown>>;
        }>
      >();
    const newerSnapshot =
      createDeferredPromise<
        Array<{
          id: string;
          name: string;
          sourceType: "git";
          repoProvider: string;
          repoUrl: string;
          repoKey: string;
          createdAt: string;
          updatedAt: string;
          createdByUserId: string;
          workspaces: Array<Record<string, unknown>>;
        }>
      >();

    apiMocks.listProjects
      .mockImplementationOnce(() => olderSnapshot.promise)
      .mockImplementationOnce(() => newerSnapshot.promise);

    const olderLoad = loadWorkspaceSnapshot();

    workspaceStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Project 1",
          key: "project-1",
          path: "/tmp/project-1",
          localPath: "/tmp/project-1",
          worktreePath: "/tmp/project-1",
          sourceType: "git",
          repoProvider: "github",
          repoUrl: "https://github.com/test/project-1.git",
          repoKey: "project-1",
          icon: "folder",
          color: "#1E66F5",
          setupScript: "",
          postScript: "",
          contextEnabled: true,
          organizationId: "org-1",
          createdByUserId: "user-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          missing: false,
          defaultBranch: "main",
          commands: [],
        },
      ],
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "project-1",
          repoId: "project-1",
          name: "feature-a",
          title: "feature-a",
          sourceBranch: "main",
          branch: "feature-a",
          summaryId: "workspace-1",
          worktreePath: "/tmp/project-1/.worktrees/feature-a",
          nodeId: "node-1",
          kind: "managed",
        },
      ],
      selectedProjectId: "project-1",
      selectedWorkspaceId: "workspace-1",
    }));

    const newerLoad = loadWorkspaceSnapshot();

    newerSnapshot.resolve([
      {
        id: "project-1",
        name: "Project 1",
        sourceType: "git",
        repoProvider: "github",
        repoUrl: "https://github.com/test/project-1.git",
        repoKey: "project-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdByUserId: "user-1",
        workspaces: [
          {
            id: "workspace-1",
            organizationId: "org-1",
            projectId: "project-1",
            userId: "user-1",
            nodeId: "node-1",
            kind: "worktree",
            status: "active",
            branch: "feature-a",
            sourceBranch: "main",
            localPath: "/tmp/project-1/.worktrees/feature-a",
            latestPullRequest: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ]);
    await newerLoad;

    expect(workspaceStore.getState().workspaces).toEqual([
      expect.objectContaining({
        id: "workspace-1",
        worktreePath: "/tmp/project-1/.worktrees/feature-a",
      }),
    ]);

    olderSnapshot.resolve([
      {
        id: "project-1",
        name: "Project 1",
        sourceType: "git",
        repoProvider: "github",
        repoUrl: "https://github.com/test/project-1.git",
        repoKey: "project-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdByUserId: "user-1",
        workspaces: [],
      },
    ]);
    await olderLoad;

    expect(workspaceStore.getState().workspaces).toEqual([
      expect.objectContaining({
        id: "workspace-1",
        worktreePath: "/tmp/project-1/.worktrees/feature-a",
      }),
    ]);
  });

  it("creates backend project and then appends store state", async () => {
    const appendRepo = vi.fn();
    const addWorkspace = vi.fn();
    workspaceStore.setState({ createProject: appendRepo, addWorkspace });
    sessionStore.setState({ selectedOrganizationId: "org-1", daemonId: "daemon-1" });
    apiMocks.listOrganizationNodes.mockResolvedValueOnce([
      {
        id: "daemon-1",
        name: "local",
        scope: "private",
        endpoint: null,
        metadata: null,
        ownerUserId: "user-1",
        organizationId: null,
        canUse: true,
        createdByUserId: "user-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    rpcMocks.gitInspect.mockResolvedValueOnce({
      isGitRepository: true,
      remoteUrl: "https://github.com/test/repo-1.git",
      currentBranch: "main",
    });
    apiMocks.createProject.mockResolvedValueOnce({
      id: "project-1",
      name: "Repo 1",
      sourceType: "git",
      repoProvider: null,
      repoUrl: "https://github.com/test/repo-1.git",
      repoKey: "repo-1",
      workspaces: [],
    });

    await createProject({
      name: "Repo 1",
      path: "/tmp/repo-1",
    });

    expect(apiMocks.createProject).toHaveBeenCalledWith("org-1", {
      name: "Repo 1",
      sourceTypeHint: "git",
      repoUrl: "https://github.com/test/repo-1.git",
      nodeId: "daemon-1",
      localPath: "/tmp/repo-1",
      contextEnabled: true,
    });
    expect(appendRepo).toHaveBeenCalledTimes(1);
    expect(addWorkspace).not.toHaveBeenCalled();
    expect(appendRepo.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        backendProject: expect.objectContaining({
          defaultBranch: "main",
        }),
      }),
    );
  });

  it("uses workspace default context setting during project creation", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    workspaceSettingsStore.setState({ isDefaultContextEnabled: false });
    apiMocks.createProject.mockResolvedValueOnce({
      id: "project-1",
      name: "Remote Repo",
      sourceType: "git",
      repoProvider: "github",
      repoUrl: "https://github.com/test/remote-repo.git",
      repoKey: "remote-repo",
      contextEnabled: false,
      workspaces: [],
    });

    await createProject({
      name: "Remote Repo",
      sourceTypeHint: "git",
      gitUrl: "https://github.com/test/remote-repo.git",
    });

    expect(apiMocks.createProject).toHaveBeenCalledWith("org-1", expect.objectContaining({ contextEnabled: false }));
  });

  it("adds created backend workspace entries for remote projects", async () => {
    const appendRepo = vi.fn();
    const addWorkspace = vi.fn();
    workspaceStore.setState({ createProject: appendRepo, addWorkspace });
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    apiMocks.createProject.mockResolvedValueOnce({
      id: "project-remote-1",
      name: "Remote Repo",
      sourceType: "git",
      repoProvider: "github",
      repoUrl: "https://github.com/test/remote-repo.git",
      repoKey: "remote-repo",
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "project-remote-1",
          userId: "user-1",
          nodeId: "node-1",
          kind: "primary",
          status: "active",
          branch: "main",
          localPath: "/tmp/remote-repo",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    await createProject({
      name: "Remote Repo",
      sourceTypeHint: "git",
      gitUrl: "https://github.com/test/remote-repo.git",
    });

    expect(appendRepo).toHaveBeenCalledTimes(1);
    expect(appendRepo.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        backendProject: expect.objectContaining({
          localPath: "/tmp/remote-repo",
          worktreePath: "/tmp/remote-repo",
          defaultBranch: "main",
        }),
      }),
    );
    expect(addWorkspace).toHaveBeenCalledWith({
      projectId: "project-remote-1",
      workspaceId: "workspace-1",
      name: "local",
      sourceBranch: "main",
      branch: "main",
      worktreePath: "/tmp/remote-repo",
      nodeId: "node-1",
    });
  });

  it("deletes backend project and then removes project from store", async () => {
    const removeRepo = vi.fn();
    const retainWorkspaceTabs = vi.fn().mockReturnValue(["tab-1"]);
    const resolveTabForWorkspace = vi.fn();
    const removeTabData = vi.fn();
    const removeWorkspaceTaskCounts = vi.fn();

    tabStore.setState({ retainWorkspaceTabs, resolveTabForWorkspace });
    chatStore.setState({ removeTabData, removeWorkspaceTaskCounts });
    workspaceStore.setState({ deleteProject: removeRepo });
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    apiMocks.deleteProject.mockResolvedValueOnce(undefined);

    await deleteProject("repo-1");

    expect(apiMocks.deleteProject).toHaveBeenCalledWith("org-1", "repo-1");
    expect(removeRepo).toHaveBeenCalledWith("repo-1");
    expect(retainWorkspaceTabs).toHaveBeenCalledTimes(1);
    expect(resolveTabForWorkspace).toHaveBeenCalledTimes(1);
    expect(removeTabData).toHaveBeenCalledWith(["tab-1"]);
    expect(removeWorkspaceTaskCounts).not.toHaveBeenCalled();
  });

  it("persists config and updates local store fields", async () => {
    const applyRepoConfig = vi.fn();
    const bumpRefreshVersion = vi.fn();
    workspaceStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          localPath: "/tmp/repo-1",
          gitUrl: "",
          worktreePath: "/tmp/repo-1",
        },
      ],
      updateProjectConfig: applyRepoConfig,
      incrementFileTreeRefreshVersion: bumpRefreshVersion,
    });
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    apiMocks.updateProject.mockResolvedValueOnce({
      id: "repo-1",
      name: "Repo 1",
      sourceType: "git-local",
      repoProvider: null,
      repoUrl: null,
      repoKey: null,
      icon: "folder",
      color: "#1E66F5",
      setupScript: "npm ci",
      postScript: "rm -rf node_modules",
      contextEnabled: true,
      organizationId: "org-1",
      createdByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await updateProjectConfig("repo-1", {
      name: "Repo 1",
      worktreePath: "/tmp/repo-1",
      contextEnabled: true,
      icon: "folder",
      color: "#1E66F5",
      setupScript: "npm ci",
      postScript: "rm -rf node_modules",
    });

    expect(apiMocks.updateProject).toHaveBeenCalledWith("org-1", "repo-1", {
      name: "Repo 1",
      icon: "folder",
      color: "#1E66F5",
      setupScript: "npm ci",
      postScript: "rm -rf node_modules",
      contextEnabled: true,
    });
    expect(applyRepoConfig).toHaveBeenCalledTimes(1);
    expect(bumpRefreshVersion).toHaveBeenCalledTimes(1);
    expect(rpcMocks.workspaceSyncContextLink).not.toHaveBeenCalled();
  });

  it("syncs context links across all project workspaces when contextEnabled changes", async () => {
    const applyRepoConfig = vi.fn();
    const bumpRefreshVersion = vi.fn();
    workspaceStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "repo-key",
          repoKey: "repo-key",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          localPath: "/tmp/repo-1",
          gitUrl: "",
          worktreePath: "/tmp/repo-1",
          contextEnabled: false,
        },
      ],
      workspaces: [
        {
          id: "ws-primary",
          projectId: "repo-1",
          repoId: "repo-1",
          name: "local",
          title: "local",
          sourceBranch: "main",
          branch: "main",
          summaryId: "ws-primary",
          worktreePath: "/tmp/repo-1",
        },
        {
          id: "ws-feature",
          projectId: "repo-1",
          repoId: "repo-1",
          name: "feature-x",
          title: "feature-x",
          sourceBranch: "main",
          branch: "feature-x",
          summaryId: "ws-feature",
          worktreePath: "/tmp/repo-1-worktrees/feature-x",
        },
        {
          id: "ws-other",
          projectId: "repo-2",
          repoId: "repo-2",
          name: "main",
          title: "main",
          sourceBranch: "main",
          branch: "main",
          summaryId: "ws-other",
          worktreePath: "/tmp/other-repo",
        },
      ],
      updateProjectConfig: applyRepoConfig,
      incrementFileTreeRefreshVersion: bumpRefreshVersion,
    });
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    apiMocks.updateProject.mockResolvedValueOnce({
      id: "repo-1",
      name: "Repo 1",
      sourceType: "git-local",
      repoProvider: null,
      repoUrl: null,
      repoKey: "repo-key",
      icon: "folder",
      color: "#1E66F5",
      setupScript: "",
      postScript: "",
      contextEnabled: true,
      organizationId: "org-1",
      createdByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await updateProjectConfig("repo-1", {
      name: "Repo 1",
      worktreePath: "/tmp/repo-1",
      contextEnabled: true,
    });

    expect(rpcMocks.workspaceSyncContextLink).toHaveBeenCalledTimes(1);
    const call = (
      rpcMocks.workspaceSyncContextLink.mock.calls[0] as unknown as [
        { repoKey: string; enabled: boolean; worktreePaths: string[] },
      ]
    )[0];
    expect(call.repoKey).toBe("repo-key");
    expect(call.enabled).toBe(true);
    // Both workspaces for this project plus the project's own localPath (deduped).
    expect(new Set(call.worktreePaths)).toEqual(new Set(["/tmp/repo-1", "/tmp/repo-1-worktrees/feature-x"]));
    expect(call.worktreePaths).not.toContain("/tmp/other-repo");
  });

  it("does not sync context links when contextEnabled value is unchanged", async () => {
    const applyRepoConfig = vi.fn();
    const bumpRefreshVersion = vi.fn();
    workspaceStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "repo-key",
          repoKey: "repo-key",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          localPath: "/tmp/repo-1",
          gitUrl: "",
          worktreePath: "/tmp/repo-1",
          contextEnabled: true,
        },
      ],
      workspaces: [],
      updateProjectConfig: applyRepoConfig,
      incrementFileTreeRefreshVersion: bumpRefreshVersion,
    });
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    apiMocks.updateProject.mockResolvedValueOnce({
      id: "repo-1",
      name: "Repo 1 Renamed",
      sourceType: "git-local",
      repoProvider: null,
      repoUrl: null,
      repoKey: "repo-key",
      icon: "folder",
      color: "#1E66F5",
      setupScript: "",
      postScript: "",
      contextEnabled: true,
      organizationId: "org-1",
      createdByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await updateProjectConfig("repo-1", {
      name: "Repo 1 Renamed",
      contextEnabled: true,
    });

    expect(rpcMocks.workspaceSyncContextLink).not.toHaveBeenCalled();
  });
});
