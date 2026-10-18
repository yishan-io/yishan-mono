// @vitest-environment jsdom

import { hydrateProjectFilter, writeProjectFilter } from "@renderer/domains/project";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { workspaceSettingsStore, workspaceStore } from "@renderer/domains/workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../../domains/project/commands/projectCommands";
import { projectStore } from "../../domains/project/state/projectStore";
import { sessionStore } from "../../domains/session/state/sessionStore";
import { loadWorkspaceSnapshot } from "./workspaceSnapshotFlow";

const apiMocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  listOrganizations: vi.fn(),
}));

const rpcMocks = vi.hoisted(() => ({
  filter: vi.fn(),
  listProjects: vi.fn(),
  workspaceImportLocalPath: vi.fn(),
  workspaceListLocalFolders: vi.fn(async () => []),
  workspaceOpenProject: vi.fn(async () => ({ opened: [], skipped: [], errors: [] })),
  workspaceSyncContextLink: vi.fn(async () => ({ updated: [], skipped: [], errors: {} })),
}));

vi.mock("@renderer/domains/organization/api/orgApi", () => ({
  listOrganizations: apiMocks.listOrganizations,
}));

vi.mock("@renderer/rpc/client", () => ({
  subscribeConnectionStatus: vi.fn(() => vi.fn()),
  request: async (method: string, params?: { organizationId?: string; scope?: string; key?: string }) => {
    if (params?.key === "project.filter") return rpcMocks.filter(method, params);
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

beforeEach(() => {
  const filters = new Map<string, { found: true; value: { isInitialized: boolean; displayProjectIds?: string[] } }>();
  rpcMocks.filter.mockReset().mockImplementation(
    (
      method: string,
      params: {
        scope: string;
        value: { isInitialized: boolean; displayProjectIds?: string[] };
        initializeOnly?: boolean;
      },
    ) => {
      if (method === "preferences.get") return filters.get(params.scope) ?? { found: false };
      if (params.initializeOnly && filters.has(params.scope)) return filters.get(params.scope);
      const saved = { found: true as const, value: params.value };
      filters.set(params.scope, saved);
      return saved;
    },
  );
});

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
  it.each([
    { savedIds: [] },
    { savedIds: ["project-created"] },
    { savedIds: ["project-created", "project-unavailable"] },
  ])("preserves saved filter $savedIds through empty, unrelated, and restored snapshots", async ({ savedIds }) => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      loaded: true,
    });
    projectStore.getState().setOrganizationDisplayProjectIds("org-1", savedIds);
    const snapshots = [
      [],
      [{ ...buildSnapshotProject("Unrelated"), id: "project-new" }],
      [buildSnapshotProject("Restored")],
    ];

    for (const [index, snapshot] of snapshots.entries()) {
      rpcMocks.listProjects.mockResolvedValueOnce(snapshot);
      await loadWorkspaceSnapshot();
      expect(projectStore.getState().displayProjectIds).toEqual(savedIds);
      expect(projectStore.getState().organizationPreferencesById?.["org-1"]?.displayProjectIds).toEqual(savedIds);
      expect(workbenchNavigationStore.getState().activeProjectId).toBe(
        index === 2 && savedIds.includes("project-created") ? "project-created" : "",
      );
      const persisted = JSON.parse(localStorage.getItem("yishan-project-store") ?? "{}");
      expect(persisted.state.organizationPreferencesById["org-1"].displayProjectIds).toEqual(savedIds);
    }
  });

  it("does not add a project to display state before its create request resolves", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    const pendingProject = createDeferredPromise<ReturnType<typeof buildCreatedProject>>();
    apiMocks.createProject.mockReturnValueOnce(pendingProject.promise);

    const creation = createProject({
      name: "Created Project",
      taskPrefix: "TEST",
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
      taskPrefix: "TEST",
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
      taskPrefix: "TEST",
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
      taskPrefix: "TEST",
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

describe("Project filter SQLite authority", () => {
  function selectOrg() {
    sessionStore.setState({ selectedOrganizationId: "org-1", currentUserId: "account-1" });
    projectStore.getState().setOrganizationDisplayProjectIds("org-1", ["legacy"]);
  }

  it("uses SQLite empty over legacy and does not migrate twice", async () => {
    selectOrg();
    rpcMocks.filter.mockResolvedValue({ found: true, value: { isInitialized: true, displayProjectIds: [] } });
    expect(await hydrateProjectFilter("org-1")).toBe(true);
    expect(projectStore.getState().displayProjectIds).toEqual([]);
    expect(rpcMocks.filter).toHaveBeenCalledTimes(1);
  });

  it("migrates explicit org filters only after the missing read", async () => {
    selectOrg();
    rpcMocks.filter
      .mockResolvedValueOnce({ found: false })
      .mockResolvedValueOnce({ found: true, value: { isInitialized: true, displayProjectIds: ["legacy"] } });
    await hydrateProjectFilter("org-1");
    expect(rpcMocks.filter.mock.calls.map(([method]) => method)).toEqual(["preferences.get", "preferences.set"]);
    expect(rpcMocks.filter.mock.calls[1]?.[1]).toMatchObject({
      initializeOnly: true,
      value: { isInitialized: true, displayProjectIds: ["legacy"] },
    });
  });

  it("does not materialize default filters when no org preference exists", async () => {
    selectOrg();
    rpcMocks.filter
      .mockResolvedValueOnce({ found: false })
      .mockResolvedValueOnce({ found: true, value: { isInitialized: true } });
    await hydrateProjectFilter("org-2");
    expect(rpcMocks.filter.mock.calls[1]?.[1]?.value?.displayProjectIds).toBeUndefined();
    expect(projectStore.getState().organizationPreferencesById?.["org-2"]?.displayProjectIds).toBeUndefined();
  });

  it("waits for hydration before writing and applies only an acknowledged write", async () => {
    selectOrg();
    const pending = createDeferredPromise<{
      found: boolean;
      value: { isInitialized: boolean; displayProjectIds: string[] };
    }>();
    rpcMocks.filter.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({
      found: true,
      value: { isInitialized: true, displayProjectIds: ["next", "unavailable"] },
    });
    const writing = writeProjectFilter(["next", "unavailable"]);
    await vi.waitFor(() => expect(rpcMocks.filter).toHaveBeenCalledTimes(1));
    expect(projectStore.getState().displayProjectIds).toEqual(["legacy"]);
    pending.resolve({ found: true, value: { isInitialized: true, displayProjectIds: [] } });
    expect(await writing).toBe(true);
    expect(projectStore.getState().displayProjectIds).toEqual(["next", "unavailable"]);
  });

  it.each(["load", "write"])("does not replace preferences on %s failure", async (stage) => {
    selectOrg();
    if (stage === "write")
      rpcMocks.filter.mockResolvedValueOnce({
        found: true,
        value: { isInitialized: true, displayProjectIds: ["saved"] },
      });
    rpcMocks.filter.mockRejectedValueOnce(new Error("offline"));
    await expect(writeProjectFilter([])).rejects.toThrow("offline");
    expect(projectStore.getState().displayProjectIds).toEqual(stage === "load" ? ["legacy"] : ["saved"]);
    expect(rpcMocks.filter).toHaveBeenCalledTimes(stage === "load" ? 1 : 2);
  });

  it.each(["org", "account"])("ignores a pending hydration after an %s switch", async (scope) => {
    selectOrg();
    const pending = createDeferredPromise<{ found: boolean }>();
    rpcMocks.filter.mockReturnValueOnce(pending.promise);
    const writing = writeProjectFilter([]);
    await vi.waitFor(() => expect(rpcMocks.filter).toHaveBeenCalledTimes(1));
    sessionStore.setState(scope === "org" ? { selectedOrganizationId: "org-2" } : { currentUserId: "account-2" });
    pending.resolve({ found: false });
    expect(await writing).toBe(false);
    expect(rpcMocks.filter).toHaveBeenCalledTimes(1);
    expect(projectStore.getState().displayProjectIds).toEqual(["legacy"]);
  });

  it("hydrates before fetching snapshots and stops snapshots on filter load failure", async () => {
    selectOrg();
    sessionStore.setState({ organizations: [{ id: "org-1", name: "Org 1" }] });
    const pending = createDeferredPromise<{
      found: boolean;
      value: { isInitialized: boolean; displayProjectIds: string[] };
    }>();
    rpcMocks.filter.mockReturnValueOnce(pending.promise);
    rpcMocks.listProjects.mockResolvedValueOnce([]);
    const loading = loadWorkspaceSnapshot();
    await vi.waitFor(() => expect(rpcMocks.filter).toHaveBeenCalledTimes(1));
    expect(rpcMocks.listProjects).not.toHaveBeenCalled();
    pending.resolve({ found: true, value: { isInitialized: true, displayProjectIds: [] } });
    await loading;
    expect(projectStore.getState().displayProjectIds).toEqual([]);
    rpcMocks.filter.mockRejectedValueOnce(new Error("offline"));
    await loadWorkspaceSnapshot();
    expect(rpcMocks.listProjects).toHaveBeenCalledTimes(1);
  });

  it("does not write when legacy initialization fails", async () => {
    selectOrg();
    rpcMocks.filter.mockResolvedValueOnce({ found: false }).mockRejectedValueOnce(new Error("disk full"));
    await expect(writeProjectFilter([])).rejects.toThrow("disk full");
    expect(rpcMocks.filter).toHaveBeenCalledTimes(2);
    expect(projectStore.getState().displayProjectIds).toEqual(["legacy"]);
  });

  it("serializes rapid writes and does not publish a pending write after a scope switch", async () => {
    selectOrg();
    const pending = createDeferredPromise<{
      found: boolean;
      value: { isInitialized: boolean; displayProjectIds: string[] };
    }>();
    rpcMocks.filter
      .mockResolvedValueOnce({ found: true, value: { isInitialized: true, displayProjectIds: ["saved"] } })
      .mockReturnValueOnce(pending.promise);
    const first = writeProjectFilter(["first"]);
    await vi.waitFor(() => expect(rpcMocks.filter).toHaveBeenCalledTimes(2));
    const second = writeProjectFilter(["second"]);
    await Promise.resolve();
    expect(rpcMocks.filter).toHaveBeenCalledTimes(2);
    sessionStore.setState({ selectedOrganizationId: "org-2" });
    pending.resolve({ found: true, value: { isInitialized: true, displayProjectIds: ["first"] } });
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(projectStore.getState().displayProjectIds).toEqual(["saved"]);
    expect(rpcMocks.filter).toHaveBeenCalledTimes(2);
  });

  it("ignores a snapshot if the account switches away and back while projects load", async () => {
    selectOrg();
    sessionStore.setState({ organizations: [{ id: "org-1", name: "Org 1" }] });
    rpcMocks.filter.mockResolvedValueOnce({
      found: true,
      value: { isInitialized: true, displayProjectIds: ["legacy"] },
    });
    const pending = createDeferredPromise<ReturnType<typeof buildSnapshotProject>[]>();
    rpcMocks.listProjects.mockReturnValueOnce(pending.promise);
    const loading = loadWorkspaceSnapshot();
    await vi.waitFor(() => expect(rpcMocks.listProjects).toHaveBeenCalledTimes(1));
    sessionStore.setState({ currentUserId: "account-2" });
    sessionStore.setState({ currentUserId: "account-1" });
    pending.resolve([buildSnapshotProject("Stale")]);
    await loading;
    expect(projectStore.getState().projects).toEqual([]);
  });

  it("uses SQLite absence over legacy without copying the previous org's default projects", async () => {
    selectOrg();
    projectStore.setState({ projects: [{ id: "other-project", name: "Other", organizationId: "org-2" }] });
    rpcMocks.filter.mockResolvedValueOnce({ found: true, value: { isInitialized: true } });
    rpcMocks.filter.mockImplementationOnce((_method, params) => ({ found: true, value: params.value }));
    await writeProjectFilter((ids) => [...ids, "new-project"]);
    expect(rpcMocks.filter.mock.calls[1]?.[1]?.value?.displayProjectIds).toEqual(["new-project"]);
    expect(projectStore.getState().organizationPreferencesById?.["org-1"]?.displayProjectIds).toEqual(["new-project"]);
  });
});
