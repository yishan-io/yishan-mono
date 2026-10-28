// @vitest-environment jsdom
import { deleteProject, projectStore, updateProjectConfig } from "@renderer/domains/project";
import { sessionStore } from "@renderer/domains/session";
import { workspaceStore } from "@renderer/domains/workspace";
import * as workspaceWarmup from "@renderer/domains/workspace/commands/workspaceWarmupCommand";
import * as workspaceClient from "@renderer/domains/workspace/daemon/daemonWorkspaceClient";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceSnapshot } from "./workspaceSnapshotFlow";

const mocks = vi.hoisted(() => ({
  requestJson: vi.fn(),
  request: vi.fn(),
  listProjects: vi.fn(),
  listFolders: vi.fn(),
}));
vi.mock("@renderer/api/restClient", () => ({ requestJson: mocks.requestJson }));
vi.mock("@renderer/rpc/client", () => ({
  request: mocks.request,
  subscribeConnectionStatus: vi.fn(() => vi.fn()),
}));
vi.mock("@renderer/events/desktopRpcEventBus", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
}));

const initialProjectState = projectStore.getState();
const initialWorkspaceState = workspaceStore.getState();
const initialSessionState = sessionStore.getState();
afterEach(() => {
  vi.restoreAllMocks();
  projectStore.setState(initialProjectState, true);
  workspaceStore.setState(initialWorkspaceState, true);
  sessionStore.setState(initialSessionState, true);
  localStorage.clear();
});

function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function snapshot(localPath = "/old", name = "Stale") {
  return [
    {
      id: "project",
      name,
      organizationId: "org",
      sourceType: "git",
      contextEnabled: false,
      repoKey: "stable",
      localPath,
      workspaces: [
        {
          id: "primary",
          projectId: "project",
          organizationId: "org",
          nodeId: "node",
          kind: "primary",
          status: "active",
          branch: "main",
          localPath,
        },
      ],
    },
  ];
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listFolders.mockResolvedValue([]);
  mocks.listProjects.mockResolvedValue([]);
  sessionStore.setState({
    selectedOrganizationId: "org",
    daemonId: "node",
    currentUserId: "actor",
    organizations: [{ id: "org", name: "Org" }],
  });
  projectStore.setState({
    projects: [
      {
        id: "project",
        name: "Old",
        organizationId: "org",
        localPath: "/old",
        path: "/old",
        worktreePath: "/worktrees",
        contextEnabled: false,
        taskPrefix: "KEEP",
        repoKey: "stable",
      },
    ],
  });
  workspaceStore.setState({
    workspaces: [
      {
        id: "primary",
        projectId: "project",
        repoId: "project",
        kind: "local",
        nodeId: "node",
        name: "local",
        title: "local",
        branch: "main",
        sourceBranch: "main",
        summaryId: "summary",
        worktreePath: "/old",
        state: "error",
        health: "path-missing",
      },
    ],
  });
  mocks.requestJson.mockResolvedValue({ project: { name: "Saved", contextEnabled: false } });
  mocks.request.mockImplementation(async (method: string) => {
    if (method === "git.inspectPath") return { isGitRepository: true, repositoryRoot: "/new" };
    if (method === "workspace.openProject") return { opened: ["primary"], skipped: [], errors: [] };
    if (method === "preferences.get")
      return { found: true, value: { isInitialized: true, displayProjectIds: ["project"] } };
    if (method === "project.listWithWorkspaces") return mocks.listProjects();
    if (method === "workspace.listLocalFolders") return mocks.listFolders();
    return {};
  });
});

const savePath = () => updateProjectConfig("project", { name: "Saved", localPath: "/new" });
const expectSavedPath = () => {
  expect(projectStore.getState().projects[0]).toMatchObject({ name: "Saved", localPath: "/new" });
  expect(workspaceStore.getState().workspaces[0]?.worktreePath).toBe("/new");
};
const expectNoOldWarmup = () => {
  expect(mocks.request).not.toHaveBeenCalledWith("workspace.openProject", {
    workspaces: expect.arrayContaining([expect.objectContaining({ worktreePath: "/old" })]),
  });
};

describe("project mutation snapshot fence", () => {
  it("rejects a list started before path save, then accepts a fresh authoritative load", async () => {
    const pending = defer<ReturnType<typeof snapshot>>();
    mocks.listProjects.mockReturnValueOnce(pending.promise);
    const loading = loadWorkspaceSnapshot();
    await vi.waitFor(() => expect(mocks.listProjects).toHaveBeenCalledTimes(1));
    await savePath();
    pending.resolve(snapshot());
    await loading;
    expectSavedPath();
    expectNoOldWarmup();
    mocks.listProjects.mockResolvedValueOnce(snapshot("/authoritative", "Fresh"));
    await loadWorkspaceSnapshot();
    expect(projectStore.getState().projects[0]?.name).toBe("Fresh");
    expect(workspaceStore.getState().workspaces[0]?.worktreePath).toBe("/authoritative");
  });

  it("does not resurrect a deleted project from a delayed list", async () => {
    const pending = defer<ReturnType<typeof snapshot>>();
    mocks.listProjects.mockReturnValueOnce(pending.promise);
    const loading = loadWorkspaceSnapshot();
    await vi.waitFor(() => expect(mocks.listProjects).toHaveBeenCalledTimes(1));
    await deleteProject("project");
    pending.resolve(snapshot());
    await loading;
    expect(projectStore.getState().projects).toEqual([]);
    expectNoOldWarmup();
    await loadWorkspaceSnapshot();
    expect(projectStore.getState().projects).toEqual([]);
    expect(workspaceStore.getState().workspaces).toEqual([]);
  });

  it("skips snapshots started during an in-flight mutation", async () => {
    const pendingSave = defer<{ project: { name: string; contextEnabled: boolean } }>();
    mocks.requestJson.mockReturnValueOnce(pendingSave.promise);
    const saving = savePath();
    await vi.waitFor(() => expect(mocks.requestJson).toHaveBeenCalledTimes(1));
    mocks.listProjects.mockResolvedValueOnce(snapshot());
    await loadWorkspaceSnapshot();
    expect(mocks.listProjects).not.toHaveBeenCalled();
    pendingSave.resolve({ project: { name: "Saved", contextEnabled: false } });
    await saving;
    expectSavedPath();
    expectNoOldWarmup();
  });

  it("stops post-await folder writes and warmup after a path save", async () => {
    const pendingFolders = defer<[]>();
    mocks.listProjects.mockResolvedValueOnce(snapshot());
    mocks.listFolders.mockReturnValueOnce(pendingFolders.promise);
    const loading = loadWorkspaceSnapshot();
    await vi.waitFor(() => expect(mocks.listFolders).toHaveBeenCalledTimes(1));
    await savePath();
    const loadFolders = vi.spyOn(workspaceStore.getState(), "loadLocalFolders");
    pendingFolders.resolve([]);
    await loading;
    expectSavedPath();
    expect(loadFolders).not.toHaveBeenCalled();
    loadFolders.mockRestore();
    expectNoOldWarmup();
  });

  it.each(["save", "delete"])("releases the guard after %s failure", async (operation) => {
    mocks.requestJson.mockRejectedValueOnce(new Error("offline"));
    await expect(operation === "save" ? savePath() : deleteProject("project")).rejects.toThrow("offline");
    mocks.listProjects.mockResolvedValueOnce(snapshot("/recovered", "Recovered"));
    await loadWorkspaceSnapshot();
    expect(projectStore.getState().projects[0]?.name).toBe("Recovered");
    expect(workspaceStore.getState().workspaces[0]?.worktreePath).toBe("/recovered");
  });
});

describe("snapshot warmup scope lifetime", () => {
  function trackScopeRelease() {
    const subscribe = sessionStore.subscribe;
    const releases: ReturnType<typeof vi.fn>[] = [];
    vi.spyOn(sessionStore, "subscribe").mockImplementation((listener) => {
      const release = vi.fn(subscribe(listener));
      releases.push(release);
      return release;
    });
    return releases;
  }

  it.each([
    ["daemonId", "node", "other-node", false],
    ["daemonId", "node", "other-node", true],
    ["currentUserId", "actor", "other-actor", false],
    ["currentUserId", "actor", "other-actor", true],
    ["selectedOrganizationId", "org", "other-org", false],
    ["selectedOrganizationId", "org", "other-org", true],
  ] as const)(
    "invalidates deferred warmup for %s from %s to %s (away-and-back: %s)",
    async (key, original, other, back) => {
      const pendingRpc = defer<workspaceClient.DaemonWorkspaceClient>();
      const invoke = vi.fn().mockResolvedValue({ opened: ["primary"], skipped: [], errors: [] });
      const folderRpc = workspaceClient.getWorkspaceRpc();
      const acquire = vi
        .spyOn(workspaceClient, "getWorkspaceRpc")
        .mockReturnValueOnce(folderRpc)
        .mockReturnValue(pendingRpc.promise);
      const warmup = vi.spyOn(workspaceWarmup, "warmupWorkspacesForProjects");
      const releases = trackScopeRelease();
      const diagnostics = vi.spyOn(console, "info").mockImplementation(() => {});
      mocks.listProjects.mockResolvedValueOnce(snapshot());
      let settled = false;
      const loading = loadWorkspaceSnapshot({ diagnostics: true }).then(() => {
        settled = true;
      });
      try {
        await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(2));
        const isCurrent = warmup.mock.calls[0]?.[1];
        expect(isCurrent?.()).toBe(true);
        sessionStore.setState({ [key]: other });
        if (back) sessionStore.setState({ [key]: original });
        expect(isCurrent?.()).toBe(false);
        expect(settled).toBe(false);
        expect(releases[0]).not.toHaveBeenCalled();
        pendingRpc.resolve(new workspaceClient.DaemonWorkspaceClient(invoke, new Map()));
        await loading;
        expect(invoke).not.toHaveBeenCalled();
        expect(isCurrent?.()).toBe(false);
        expect(releases[0]).toHaveBeenCalledTimes(1);
        expect(diagnostics).toHaveBeenCalledWith(
          "Workspace snapshot diagnostics",
          expect.objectContaining({
            outcome: "skipped",
            stage: "warmup",
            reason: "scope-changed",
          }),
        );
      } finally {
        pendingRpc.resolve(new workspaceClient.DaemonWorkspaceClient(invoke, new Map()));
        await loading;
      }
    },
  );

  it("keeps warmup errors best-effort and releases the scope listener", async () => {
    const releases = trackScopeRelease();
    const error = new Error("warmup offline");
    const folderRpc = workspaceClient.getWorkspaceRpc();
    vi.spyOn(workspaceClient, "getWorkspaceRpc").mockReturnValueOnce(folderRpc).mockRejectedValueOnce(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listProjects.mockResolvedValueOnce(snapshot());
    await expect(loadWorkspaceSnapshot({ throwOnError: true })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[warmup] workspace.openProject failed", error);
    expect(releases[0]).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("releases the scope listener on snapshot errors (rethrow: %s)", async (throwOnError) => {
    const releases = trackScopeRelease();
    const error = new Error("snapshot offline");
    mocks.listProjects.mockRejectedValueOnce(error);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loading = loadWorkspaceSnapshot({ throwOnError });
    if (throwOnError) await expect(loading).rejects.toBe(error);
    else await expect(loading).resolves.toBeUndefined();
    expect(releases[0]).toHaveBeenCalledTimes(1);
  });
});
