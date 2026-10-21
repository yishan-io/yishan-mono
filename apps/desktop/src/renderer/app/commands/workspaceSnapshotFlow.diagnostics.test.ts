// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { workspaceSettingsStore, workspaceStore } from "@renderer/domains/workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("manual snapshot diagnostics", () => {
  beforeEach(() => {
    sessionStore.setState({
      organizations: [{ id: "org-1", name: "Private organization" }],
      selectedOrganizationId: "org-1",
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("logs one bounded applied summary with actual displayed projects, not saved IDs", async () => {
    projectStore.getState().setOrganizationDisplayProjectIds("org-1", ["project-created", "missing"]);
    rpcMocks.listProjects.mockResolvedValueOnce([buildSnapshotProject("Private project")]);
    await loadWorkspaceSnapshot({ diagnostics: true });
    expect(console.info).toHaveBeenCalledExactlyOnceWith("Workspace snapshot diagnostics", {
      requestId: expect.any(Number),
      outcome: "applied",
      stage: "complete",
      reason: "snapshot-applied",
      fetchedProjectCount: 1,
      fetchedWorkspaceCount: 0,
      reconciledProjectCount: 1,
      reconciledWorkspaceCount: 0,
      storeProjectCount: 1,
      storeWorkspaceCount: 0,
      displayedProjectCount: 1,
    });
  });

  it.each(["superseded", "scope"])("identifies a %s skip while projects load", async (kind) => {
    const pending = createDeferredPromise<ReturnType<typeof buildSnapshotProject>[]>();
    rpcMocks.listProjects.mockReturnValueOnce(pending.promise);
    const loading = loadWorkspaceSnapshot({ diagnostics: true, throwOnError: true });
    await vi.waitFor(() => expect(rpcMocks.listProjects).toHaveBeenCalledTimes(1));
    if (kind === "scope") {
      sessionStore.setState({ selectedOrganizationId: "org-2" });
      sessionStore.setState({ selectedOrganizationId: "org-1" });
    } else {
      rpcMocks.listProjects.mockResolvedValueOnce([]);
      await loadWorkspaceSnapshot();
    }
    pending.resolve([buildSnapshotProject("Private stale project")]);
    await loading;
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(
      "Workspace snapshot diagnostics",
      expect.objectContaining({
        outcome: "skipped",
        stage: "projects",
        reason: kind === "scope" ? "scope-changed" : "request-superseded",
        fetchedProjectCount: 1,
        reconciledProjectCount: null,
      }),
    );
    expect(projectStore.getState().projects).toEqual([]);
  });

  it("reports the error stage without error contents and preserves error logging", async () => {
    const error = new Error("private path /secret/token");
    rpcMocks.listProjects.mockRejectedValueOnce(error);
    await loadWorkspaceSnapshot({ diagnostics: true });
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(
      "Workspace snapshot diagnostics",
      expect.objectContaining({
        outcome: "error",
        stage: "projects",
        reason: "exception",
        fetchedProjectCount: null,
      }),
    );
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(error.message);
    expect(console.error).toHaveBeenCalledWith("Failed to load workspace snapshot", error);
  });

  it("rethrows the original error only when requested and still emits diagnostics", async () => {
    const error = new Error("daemon unavailable");
    rpcMocks.listProjects.mockRejectedValueOnce(error);
    await expect(loadWorkspaceSnapshot({ diagnostics: true, throwOnError: true })).rejects.toBe(error);
    expect(console.error).toHaveBeenCalledWith("Failed to load workspace snapshot", error);
    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      "Workspace snapshot diagnostics",
      expect.objectContaining({ outcome: "error", stage: "projects" }),
    );
  });

  it("keeps zero-argument automatic loads quiet on success and failure", async () => {
    rpcMocks.listProjects.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("offline"));
    await expect(loadWorkspaceSnapshot()).resolves.toBeUndefined();
    await expect(loadWorkspaceSnapshot()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("Failed to load workspace snapshot", expect.any(Error));
    expect(console.info).not.toHaveBeenCalled();
  });

  it("reports the no-organization completion path", async () => {
    sessionStore.setState({ organizations: [], selectedOrganizationId: "" });
    apiMocks.listOrganizations.mockResolvedValueOnce([]);
    await loadWorkspaceSnapshot({ diagnostics: true });
    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      "Workspace snapshot diagnostics",
      expect.objectContaining({
        outcome: "applied",
        stage: "complete",
        reason: "local-folders-only",
      }),
    );
  });

  it("reports a snapshot omitted newly added project without applying it", async () => {
    const pending = createDeferredPromise<ReturnType<typeof buildSnapshotProject>[]>();
    rpcMocks.listProjects.mockReturnValueOnce(pending.promise);
    const loading = loadWorkspaceSnapshot({ diagnostics: true, throwOnError: true });
    await vi.waitFor(() => expect(rpcMocks.listProjects).toHaveBeenCalledTimes(1));
    projectStore.setState({ projects: [{ id: "new", name: "Private new project" }] });
    pending.resolve([]);
    await loading;
    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      "Workspace snapshot diagnostics",
      expect.objectContaining({
        outcome: "skipped",
        stage: "projects",
        reason: "snapshot-omitted-new-project",
        storeProjectCount: 1,
      }),
    );
  });
});
