// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { workspaceSettingsStore, workspaceStore } from "@renderer/domains/workspace";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../../domains/project/commands/projectCommands";
import { projectStore } from "../../domains/project/state/projectStore";
import { sessionStore } from "../../domains/session/state/sessionStore";
import { loadWorkspaceSnapshot } from "./workspaceSnapshotFlow";

const apiMocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  listOrganizations: vi.fn(),
}));

const rpcMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  workspaceImportLocalPath: vi.fn(),
  workspaceListLocalFolders: vi.fn(async () => []),
  workspaceOpenProject: vi.fn(async () => ({ opened: [], skipped: [], errors: [] })),
  workspaceSyncContextLink: vi.fn(async () => ({ updated: [], skipped: [], errors: {} })),
}));

vi.mock("@renderer/domains/organization/api/orgApi", () => ({
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

vi.mock("@renderer/events/desktopRpcEventBus", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
}));

vi.mock("@renderer/domains/project/api/projectApi", () => ({
  createProject: apiMocks.createProject,
}));

vi.mock("@renderer/domains/workspace/daemon/daemonWorkspaceClient", () => ({
  getWorkspaceRpc: () =>
    Promise.resolve({
      importLocalPath: rpcMocks.workspaceImportLocalPath,
      listLocalFolders: rpcMocks.workspaceListLocalFolders,
      openProject: rpcMocks.workspaceOpenProject,
      syncContextLink: rpcMocks.workspaceSyncContextLink,
    }),
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
}));

const initialProjectStoreState = projectStore.getState();
const initialSessionStoreState = sessionStore.getState();
const initialWorkbenchNavigationStoreState = workbenchNavigationStore.getState();
const initialWorkspaceSettingsStoreState = workspaceSettingsStore.getState();
const initialWorkspaceStoreState = workspaceStore.getState();

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function buildCreatedProject(name: string) {
  return {
    id: "project-created",
    name,
    sourceType: "git" as const,
    repoProvider: "github",
    repoUrl: "https://github.com/test/created-project.git",
    repoKey: "created-project",
    contextEnabled: true,
    workspaces: [],
  };
}

function buildSnapshotProject(name: string) {
  return {
    ...buildCreatedProject(name),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

afterEach(() => {
  localStorage.clear();
  projectStore.setState(initialProjectStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  workbenchNavigationStore.setState(initialWorkbenchNavigationStoreState, true);
  workspaceSettingsStore.setState(initialWorkspaceSettingsStoreState, true);
  workspaceStore.setState(initialWorkspaceStoreState, true);
  vi.clearAllMocks();
});

describe("workspaceSnapshotFlow", () => {
  it("does not add a project to display state before its create request resolves", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    const pendingProject = createDeferredPromise<ReturnType<typeof buildCreatedProject>>();
    apiMocks.createProject.mockReturnValueOnce(pendingProject.promise);

    const creation = createProject({
      name: "Created Project",
      sourceTypeHint: "git",
      gitUrl: "https://github.com/test/created-project.git",
    });
    await vi.waitFor(() => expect(apiMocks.createProject).toHaveBeenCalledTimes(1));

    expect(projectStore.getState().projects).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "project-created" })]),
    );
    expect(projectStore.getState().displayProjectIds).not.toContain("project-created");

    pendingProject.resolve(buildCreatedProject("Created Project"));
    await creation;

    expect(projectStore.getState().projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "project-created", name: "Created Project" })]),
    );
    expect(projectStore.getState().displayProjectIds).toContain("project-created");
  });

  it("does not add or activate a successful project after the selected organization changes", async () => {
    const createdProject = createDeferredPromise<{
      id: string;
      name: string;
      sourceType: "git";
      repoProvider: null;
      repoUrl: string;
      repoKey: string;
      contextEnabled: boolean;
      workspaces: [];
    }>();
    const appendProject = vi.fn();
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    projectStore.setState({ createProject: appendProject });
    apiMocks.createProject.mockReturnValueOnce(createdProject.promise);

    const creation = createProject({
      name: "Remote Repo",
      sourceTypeHint: "git",
      gitUrl: "https://github.com/test/remote-repo.git",
    });
    await vi.waitFor(() => expect(apiMocks.createProject).toHaveBeenCalledTimes(1));

    sessionStore.setState({ selectedOrganizationId: "org-2" });
    createdProject.resolve({
      id: "project-1",
      name: "Remote Repo",
      sourceType: "git",
      repoProvider: null,
      repoUrl: "https://github.com/test/remote-repo.git",
      repoKey: "remote-repo",
      contextEnabled: true,
      workspaces: [],
    });
    await creation;

    expect(appendProject).not.toHaveBeenCalled();
    expect(workbenchNavigationStore.getState().activeProjectId).not.toBe("project-1");
  });

  it("does not let a snapshot started before project creation remove the created project", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      loaded: true,
    });
    const pendingSnapshot = createDeferredPromise<Array<Record<string, unknown>>>();
    rpcMocks.listProjects.mockImplementationOnce(() => pendingSnapshot.promise);
    apiMocks.createProject.mockResolvedValueOnce(buildCreatedProject("Created Project"));

    const snapshotLoad = loadWorkspaceSnapshot();

    await createProject({
      name: "Created Project",
      sourceTypeHint: "git",
      gitUrl: "https://github.com/test/created-project.git",
    });

    pendingSnapshot.resolve([]);
    await snapshotLoad;

    expect(projectStore.getState().projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "project-created", name: "Created Project" })]),
    );
    expect(projectStore.getState().displayProjectIds).toContain("project-created");
  });

  it("applies a pending snapshot that includes a newly created project", async () => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      loaded: true,
    });
    const pendingSnapshot = createDeferredPromise<Array<Record<string, unknown>>>();
    rpcMocks.listProjects.mockImplementationOnce(() => pendingSnapshot.promise);
    apiMocks.createProject.mockResolvedValueOnce(buildCreatedProject("Created Project"));

    const snapshotLoad = loadWorkspaceSnapshot();

    await createProject({
      name: "Created Project",
      sourceTypeHint: "git",
      gitUrl: "https://github.com/test/created-project.git",
    });

    pendingSnapshot.resolve([
      {
        ...buildSnapshotProject("Created Project From Snapshot"),
        workspaces: [
          {
            id: "workspace-created",
            organizationId: "org-1",
            projectId: "project-created",
            userId: "user-1",
            nodeId: "node-1",
            kind: "primary",
            status: "active",
            branch: "main",
            sourceBranch: "main",
            localPath: "/tmp/created-project",
            latestPullRequest: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      },
    ]);
    await snapshotLoad;

    expect(projectStore.getState().projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "project-created", name: "Created Project From Snapshot" }),
      ]),
    );
    expect(workspaceStore.getState().workspaces).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "workspace-created", projectId: "project-created" })]),
    );
  });
});
