// @vitest-environment jsdom

import { fileTreeStore } from "@renderer/domains/files/state/fileTreeStore";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { workspaceSettingsStore } from "@renderer/domains/workspace";
import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceSnapshot } from "../../../app/commands/workspaceSnapshotFlow";
import { chatStore } from "../../../domains/agent/state/chatStore";
import { sessionStore } from "../../../domains/session/state/sessionStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { projectStore } from "../state/projectStore";
import { createProject, deleteProject, updateProjectConfig } from "./projectCommands";

const apiMocks = vi.hoisted(() => ({
  listOrganizations: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock("../../../domains/organization/infrastructure/orgApi", () => ({
  listOrganizations: apiMocks.listOrganizations,
}));

vi.mock("@renderer/rpc", () => ({
  subscribeConnectionStatus: vi.fn(() => vi.fn()),
  request: async (method: string, params?: { organizationId?: string }) => {
    if (method === "project.listWithWorkspaces") {
      return rpcMocks.listProjects(params);
    }
    return undefined;
  },
}));

vi.mock("../../../events/desktopRpcEventBus", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
}));

vi.mock("../../../domains/project/api/projectApi", () => ({
  createProject: apiMocks.createProject,
  deleteProject: apiMocks.deleteProject,
  updateProject: apiMocks.updateProject,
}));

const rpcMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  gitInspect: vi.fn(
    async () =>
      ({
        isGitRepository: true,
      }) as { isGitRepository: boolean; remoteUrl?: string; currentBranch?: string },
  ),
  workspaceList: vi.fn(async () => []),
  workspaceOpenProject: vi.fn(async () => ({ opened: [], skipped: [], errors: [] })),
  workspaceSyncContextLink: vi.fn(async () => ({ updated: [], skipped: [], errors: {} })),
  workspaceCreateLocalFolder: vi.fn(),
  workspaceListLocalFolders: vi.fn(
    async () => [] as Array<{ id: string; path: string; name?: string; state?: string; health?: string }>,
  ),
}));

vi.mock("../../../domains/workspace/infrastructure/daemonWorkspaceClient", () => ({
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  getWorkspaceRpc: () =>
    Promise.resolve({
      list: rpcMocks.workspaceList,
      openProject: rpcMocks.workspaceOpenProject,
      syncContextLink: rpcMocks.workspaceSyncContextLink,
      createLocalFolder: rpcMocks.workspaceCreateLocalFolder,
      listLocalFolders: rpcMocks.workspaceListLocalFolders,
    }),
}));

vi.mock("../../../domains/git/infrastructure/daemonGitClient", () => ({
  getGitRpc: () =>
    Promise.resolve({
      inspectPath: rpcMocks.gitInspect,
    }),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialProjectStoreState = projectStore.getState();
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
  projectStore.setState(initialProjectStoreState, true);
  workspaceStore.setState(initialWorkspaceStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  chatStore.setState(initialChatStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  workspaceSettingsStore.setState(initialWorkspaceSettingsStoreState, true);
  vi.clearAllMocks();
});

describe("projectCommands", () => {
  it("loads backend snapshot and hydrates store", async () => {
    const retainWorkspaceTabs = vi.fn().mockReturnValue([]);
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ retainWorkspaceTabs, resolveTabForWorkspace });
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      loaded: true,
    });
    rpcMocks.listProjects.mockResolvedValueOnce([
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

    expect(rpcMocks.listProjects).toHaveBeenCalledWith({ organizationId: "org-1" });
    // Projects reconcile into the project store; workspaces (view models) into
    // the workspace store (D8: workspace store no longer holds projects).
    expect(projectStore.getState().projects).toEqual([expect.objectContaining({ id: "project-1", name: "Project 1" })]);
    expect(workspaceStore.getState().workspaces).toEqual([]);
    expect(retainWorkspaceTabs).toHaveBeenCalledTimes(1);
    expect(resolveTabForWorkspace).toHaveBeenCalledTimes(1);
  });

  it("merges daemon local folders after the org snapshot load()", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      loaded: true,
    });
    rpcMocks.listProjects.mockResolvedValueOnce([]);
    rpcMocks.workspaceListLocalFolders.mockResolvedValueOnce([
      { id: "folder-1", path: "/tmp/folder-1", name: "Folder 1" },
    ]);

    await loadWorkspaceSnapshot();

    expect(rpcMocks.workspaceListLocalFolders).toHaveBeenCalledTimes(1);
    expect(workspaceStore.getState().workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "folder-1",
          projectId: LOCAL_FOLDER_PROJECT_ID,
          kind: "folder",
          worktreePath: "/tmp/folder-1",
        }),
      ]),
    );
  });

  it("merges daemon local folders even when no org is selected", async () => {
    sessionStore.setState({
      organizations: [],
      selectedOrganizationId: "",
      loaded: true,
    });
    apiMocks.listOrganizations.mockResolvedValueOnce([]);
    rpcMocks.workspaceListLocalFolders.mockResolvedValueOnce([
      { id: "folder-1", path: "/tmp/folder-1", name: "Folder 1" },
    ]);

    await loadWorkspaceSnapshot();

    expect(rpcMocks.workspaceListLocalFolders).toHaveBeenCalledTimes(1);
    expect(workspaceStore.getState().workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "folder-1",
          projectId: LOCAL_FOLDER_PROJECT_ID,
          kind: "folder",
          worktreePath: "/tmp/folder-1",
        }),
      ]),
    );
  });

  it("re-opens merged daemon local folders on the daemon during snapshot load", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
    });
    rpcMocks.listProjects.mockResolvedValueOnce([]);
    rpcMocks.workspaceListLocalFolders.mockResolvedValueOnce([
      { id: "folder-1", path: "/tmp/folder-1", name: "Folder 1" },
      { id: "folder-2", path: "/tmp/folder-2", name: "Folder 2" },
    ]);

    await loadWorkspaceSnapshot();

    // File list/read/write and terminal.start need the folders open on the
    // daemon after a restart, so the snapshot must call workspace.openProject
    // with entries for every merged folder (org-scoped).
    expect(rpcMocks.workspaceOpenProject).toHaveBeenCalledWith({
      workspaces: [
        {
          workspaceId: "folder-1",
          worktreePath: "/tmp/folder-1",
          projectId: LOCAL_FOLDER_PROJECT_ID,
          orgId: "org-1",
        },
        {
          workspaceId: "folder-2",
          worktreePath: "/tmp/folder-2",
          projectId: LOCAL_FOLDER_PROJECT_ID,
          orgId: "org-1",
        },
      ],
    });
  });

  it("re-opens merged daemon local folders on the daemon with no org selected", async () => {
    sessionStore.setState({
      organizations: [],
      selectedOrganizationId: "",
      loaded: true,
    });
    apiMocks.listOrganizations.mockResolvedValueOnce([]);
    rpcMocks.workspaceListLocalFolders.mockResolvedValueOnce([
      { id: "folder-1", path: "/tmp/folder-1", name: "Folder 1" },
    ]);

    await loadWorkspaceSnapshot();

    expect(rpcMocks.workspaceOpenProject).toHaveBeenCalledWith({
      workspaces: [
        {
          workspaceId: "folder-1",
          worktreePath: "/tmp/folder-1",
          projectId: LOCAL_FOLDER_PROJECT_ID,
          orgId: "",
        },
      ],
    });
  });

  it("restores the previously selected folder after a snapshot reload", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
    });
    rpcMocks.listProjects.mockResolvedValueOnce([]);
    rpcMocks.workspaceListLocalFolders.mockResolvedValueOnce([
      { id: "folder-1", path: "/tmp/folder-1", name: "Folder 1" },
    ]);
    // The user is viewing a folder before the snapshot reload. Because
    // load() rebuilds workspaces[] without folder items, selection would
    // otherwise fall back to the first org workspace. It must be restored to
    // the folder after loadLocalFolders re-adds it.
    workbenchNavigationStore.setState({
      activeWorkspaceId: "folder-1",
      activeProjectId: LOCAL_FOLDER_PROJECT_ID,
    });
    workspaceStore.setState({
      workspaces: [
        {
          id: "folder-1",
          projectId: LOCAL_FOLDER_PROJECT_ID,
          repoId: "folder-1",
          name: "Folder 1",
          title: "Folder 1",
          sourceBranch: "",
          branch: "",
          summaryId: "folder-1",
          worktreePath: "/tmp/folder-1",
          kind: "folder",
        },
      ],
    });

    await loadWorkspaceSnapshot();

    expect(workbenchNavigationStore.getState().activeWorkspaceId).toBe("folder-1");
    expect(workbenchNavigationStore.getState().activeProjectId).toBe(LOCAL_FOLDER_PROJECT_ID);
  });

  it("creates a non-git local folder on the daemon instead of the backend project api", async () => {
    // Keep the real addLocalFolder so the folder lands in the store and the
    // import-open path can run end to end.
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    rpcMocks.gitInspect.mockResolvedValueOnce({ isGitRepository: false });
    rpcMocks.workspaceCreateLocalFolder.mockResolvedValueOnce({
      id: "folder-1",
      path: "/tmp/plain-folder",
      name: "Plain Folder",
    });

    await createProject({
      name: "Plain Folder",
      path: "/tmp/plain-folder",
    });

    expect(rpcMocks.workspaceCreateLocalFolder).toHaveBeenCalledWith({
      path: "/tmp/plain-folder",
      name: "Plain Folder",
    });
    expect(apiMocks.createProject).not.toHaveBeenCalled();
    expect(workspaceStore.getState().workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "folder-1",
          projectId: LOCAL_FOLDER_PROJECT_ID,
          kind: "folder",
          worktreePath: "/tmp/plain-folder",
          name: "Plain Folder",
        }),
      ]),
    );
    expect(rpcMocks.workspaceOpenProject).toHaveBeenCalledWith({
      workspaces: [
        {
          workspaceId: "folder-1",
          worktreePath: "/tmp/plain-folder",
          projectId: LOCAL_FOLDER_PROJECT_ID,
          orgId: "",
        },
      ],
    });
    expect(rpcMocks.workspaceSyncContextLink).not.toHaveBeenCalled();
  });

  it("selects the newly created local folder and resolves its tab", async () => {
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    rpcMocks.gitInspect.mockResolvedValueOnce({ isGitRepository: false });
    rpcMocks.workspaceCreateLocalFolder.mockResolvedValueOnce({
      id: "folder-new",
      path: "/tmp/new-folder",
      name: "New Folder",
    });

    await createProject({
      name: "New Folder",
      path: "/tmp/new-folder",
    });

    expect(workbenchNavigationStore.getState().activeWorkspaceId).toBe("folder-new");
    expect(workbenchNavigationStore.getState().activeProjectId).toBe(LOCAL_FOLDER_PROJECT_ID);
    expect(resolveTabForWorkspace).toHaveBeenCalledWith("folder-new");
  });

  it("loads visible hydrated workspaces without reopening them in daemon", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      daemonId: "node-1",
      loaded: true,
    });
    projectStore.setState({
      displayProjectIds: ["project-1"],
    });
    rpcMocks.listProjects.mockResolvedValueOnce([
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
    projectStore.setState({
      displayProjectIds: ["project-1"],
    });
    rpcMocks.listProjects.mockResolvedValueOnce([
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

    rpcMocks.listProjects
      .mockImplementationOnce(() => olderSnapshot.promise)
      .mockImplementationOnce(() => newerSnapshot.promise);

    const olderLoad = loadWorkspaceSnapshot();

    projectStore.setState({
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
          createdByUserId: "user-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          missing: false,
          defaultBranch: "main",
          commands: [],
        },
      ],
    });
    workspaceStore.setState({
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
    });

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
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    workspaceStore.setState({ addWorkspace });
    projectStore.setState({ createProject: appendRepo });
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
    apiMocks.updateProject.mockResolvedValueOnce({
      id: "project-1",
      name: "Repo 1",
      icon: "folder",
      color: "#1E66F5",
      contextEnabled: true,
      setupScript: "",
      postScript: "",
      commands: [],
    });

    await createProject({
      name: "Repo 1",
      path: "/tmp/repo-1",
    });

    expect(apiMocks.createProject).toHaveBeenCalledWith("org-1", {
      name: "Repo 1",
      sourceTypeHint: "git",
      repoUrl: "https://github.com/test/repo-1.git",
      nodeId: undefined,
      localPath: "/tmp/repo-1",
      contextEnabled: true,
    });
    expect(appendRepo).toHaveBeenCalledTimes(1);
    expect(addWorkspace).not.toHaveBeenCalled();
    expect(rpcMocks.workspaceOpenProject).not.toHaveBeenCalled();
    expect(appendRepo.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        backendProject: expect.objectContaining({
          defaultBranch: "main",
        }),
      }),
    );
  });

  it("creates a git-local project from a plain local git repo via the backend api", async () => {
    const appendRepo = vi.fn();
    const addWorkspace = vi.fn();
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          projectId: "project-plain",
          repoId: "project-plain",
          name: "local",
          title: "local",
          sourceBranch: "",
          branch: "",
          summaryId: "workspace-1",
          worktreePath: "/tmp/plain-folder",
        },
      ],
      addWorkspace,
    });

    projectStore.setState({});
    projectStore.setState({ createProject: appendRepo });
    // A git repo without a remote is git-local: still a backend project.
    rpcMocks.gitInspect.mockResolvedValueOnce({
      isGitRepository: true,
    });
    apiMocks.createProject.mockResolvedValueOnce({
      id: "project-plain",
      name: "Plain Git Repo",
      sourceType: "git-local",
      repoProvider: null,
      repoUrl: null,
      repoKey: null,
      contextEnabled: true,
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "project-plain",
          userId: "user-1",
          nodeId: "node-1",
          kind: "primary",
          status: "active",
          branch: null,
          sourceBranch: null,
          localPath: "/tmp/plain-folder",
          latestPullRequest: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    apiMocks.updateProject.mockResolvedValueOnce({
      id: "project-plain",
      name: "Plain Git Repo",
      icon: "folder",
      color: "#1E66F5",
      contextEnabled: true,
      setupScript: "",
      postScript: "",
      commands: [],
    });

    await createProject({
      name: "Plain Git Repo",
      path: "/tmp/plain-folder",
    });

    expect(apiMocks.createProject).toHaveBeenCalledWith("org-1", {
      name: "Plain Git Repo",
      sourceTypeHint: "git-local",
      repoUrl: undefined,
      nodeId: undefined,
      localPath: "/tmp/plain-folder",
      contextEnabled: true,
    });
    // git-local folders must NOT be routed to the local-folder daemon create.
    expect(rpcMocks.workspaceCreateLocalFolder).not.toHaveBeenCalled();
    expect(appendRepo).toHaveBeenCalledTimes(1);
    expect(appendRepo.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        backendProject: expect.objectContaining({
          sourceType: "git-local",
          defaultBranch: null,
        }),
      }),
    );
    expect(addWorkspace).toHaveBeenCalledWith({
      projectId: "project-plain",
      workspaceId: "workspace-1",
      name: "local",
      sourceBranch: "main",
      branch: "main",
      worktreePath: "/tmp/plain-folder",
      nodeId: "node-1",
    });
  });

  it("adds and opens the primary workspace for a git-local local folder via the backend api", async () => {
    const appendRepo = vi.fn();
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    // Keep the real addWorkspace so the returned primary workspace lands in
    // the store and the import-open path can run.
    // project records live in the project store
    projectStore.setState({ createProject: appendRepo });
    // git-local (no remote) still flows through the backend api.project.create.
    rpcMocks.gitInspect.mockResolvedValueOnce({ isGitRepository: true });
    apiMocks.createProject.mockResolvedValueOnce({
      id: "project-plain",
      name: "Plain Git Repo",
      sourceType: "git-local",
      repoProvider: null,
      repoUrl: null,
      repoKey: null,
      contextEnabled: true,
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "project-plain",
          userId: "user-1",
          nodeId: "node-1",
          kind: "primary",
          status: "active",
          branch: "main",
          sourceBranch: "main",
          localPath: "/tmp/plain-folder",
          latestPullRequest: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    apiMocks.updateProject.mockResolvedValueOnce({
      id: "project-plain",
      name: "Plain Git Repo",
      icon: "folder",
      color: "#1E66F5",
      contextEnabled: true,
      setupScript: "",
      postScript: "",
      commands: [],
    });

    await createProject({
      name: "Plain Git Repo",
      path: "/tmp/plain-folder",
    });

    expect(apiMocks.createProject).toHaveBeenCalled();
    expect(rpcMocks.workspaceCreateLocalFolder).not.toHaveBeenCalled();
    // The project row + its primary workspace reach the store, and the
    // workspace is opened on the daemon immediately.
    expect(appendRepo).toHaveBeenCalledTimes(1);
    const state = workspaceStore.getState();
    expect(state.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workspace-1",
          projectId: "project-plain",
          sourceBranch: "main",
          branch: "main",
          worktreePath: "/tmp/plain-folder",
          nodeId: "node-1",
        }),
      ]),
    );
    expect(rpcMocks.workspaceOpenProject).toHaveBeenCalledWith({
      workspaces: [
        {
          workspaceId: "workspace-1",
          worktreePath: "/tmp/plain-folder",
          projectId: "project-plain",
          orgId: "org-1",
        },
      ],
    });
  });

  it("opens imported local primary workspace immediately on the daemon", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
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
      contextEnabled: true,
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          projectId: "project-1",
          userId: "user-1",
          nodeId: "daemon-1",
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
    });
    apiMocks.updateProject.mockResolvedValueOnce({
      id: "project-1",
      name: "Repo 1",
      icon: "folder",
      color: "#1E66F5",
      contextEnabled: true,
      setupScript: "",
      postScript: "",
      commands: [],
    });

    await createProject({
      name: "Repo 1",
      path: "/tmp/repo-1",
    });

    expect(apiMocks.createProject).toHaveBeenCalledWith("org-1", {
      name: "Repo 1",
      sourceTypeHint: "git",
      repoUrl: "https://github.com/test/repo-1.git",
      nodeId: undefined,
      localPath: "/tmp/repo-1",
      contextEnabled: true,
    });
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
    apiMocks.updateProject.mockResolvedValueOnce({
      id: "project-1",
      name: "Remote Repo",
      icon: "folder",
      color: "#1E66F5",
      contextEnabled: false,
      setupScript: "",
      postScript: "",
      commands: [],
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
    workspaceStore.setState({ addWorkspace });
    projectStore.setState({ createProject: appendRepo });
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
    apiMocks.updateProject.mockResolvedValueOnce({
      id: "project-remote-1",
      name: "Remote Repo",
      icon: "folder",
      color: "#1E66F5",
      contextEnabled: true,
      setupScript: "",
      postScript: "",
      commands: [],
    });

    await createProject({
      name: "Remote Repo",
      sourceTypeHint: "git",
      gitUrl: "https://github.com/test/remote-repo.git",
    });

    expect(appendRepo).toHaveBeenCalledTimes(1);
    expect(addWorkspace).toHaveBeenCalledWith({
      projectId: "project-remote-1",
      workspaceId: "workspace-1",
      name: "local",
      sourceBranch: "main",
      branch: "main",
      worktreePath: "/tmp/remote-repo",
      nodeId: "node-1",
    });
    expect(rpcMocks.workspaceOpenProject).not.toHaveBeenCalled();
  });

  it("deletes backend project and then removes project from store", async () => {
    const removeRepo = vi.fn();
    const retainWorkspaceTabs = vi.fn().mockReturnValue(["tab-1"]);
    const resolveTabForWorkspace = vi.fn();
    const removeTabData = vi.fn();
    const removeWorkspaceTaskCounts = vi.fn();

    tabStore.setState({ retainWorkspaceTabs, resolveTabForWorkspace });
    chatStore.setState({ removeTabData, removeWorkspaceTaskCounts });

    projectStore.setState({ deleteProject: removeRepo });
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
    const applyProjectConfig = vi.fn();
    const bumpRefreshVersion = vi.fn();
    projectStore.setState({
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
      updateProjectConfig: applyProjectConfig,
    });
    const incrementFileTreeRefreshVersionSpy = vi
      .spyOn(fileTreeStore.getState(), "incrementFileTreeRefreshVersion")
      .mockImplementation(bumpRefreshVersion);
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
    expect(applyProjectConfig).toHaveBeenCalledTimes(1);
    expect(bumpRefreshVersion).toHaveBeenCalledTimes(1);
    expect(rpcMocks.workspaceSyncContextLink).not.toHaveBeenCalled();
  });

  it("syncs context links across all project workspaces when contextEnabled changes", async () => {
    const applyRepoConfig = vi.fn();
    const bumpRefreshVersion = vi.fn();
    projectStore.setState({
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
    });
    workspaceStore.setState({
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
    });
    projectStore.setState({ updateProjectConfig: applyRepoConfig });
    const incrementFileTreeRefreshVersionSpy = vi
      .spyOn(fileTreeStore.getState(), "incrementFileTreeRefreshVersion")
      .mockImplementation(bumpRefreshVersion);
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
      workspaces: [],
    });
    projectStore.setState({ updateProjectConfig: applyRepoConfig });
    projectStore.setState({
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
    });
    const incrementFileTreeRefreshVersionSpy = vi
      .spyOn(fileTreeStore.getState(), "incrementFileTreeRefreshVersion")
      .mockImplementation(bumpRefreshVersion);
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

    expect(apiMocks.updateProject).toHaveBeenCalledWith("org-1", "repo-1", {
      name: "Repo 1 Renamed",
      contextEnabled: true,
    });
  });
});
