// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { workspaceSettingsStore, workspaceStore } from "@renderer/domains/workspace";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../../domains/project/commands/projectCommands";
import { projectStore } from "../../domains/project/state/projectStore";
import { sessionStore } from "../../domains/session/state/sessionStore";
import { renderWithAppTheme } from "../../testUtils/renderWithAppTheme";
import { ProjectFilterPopoverView } from "../features/project-workspace-navigator/ProjectFilterPopoverView";
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
  cleanup();
  localStorage.clear();
  projectStore.setState(initialProjectStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  workbenchNavigationStore.setState(initialWorkbenchNavigationStoreState, true);
  workspaceSettingsStore.setState(initialWorkspaceSettingsStoreState, true);
  workspaceStore.setState(initialWorkspaceStoreState, true);
  vi.clearAllMocks();
});

describe("project filter review regressions", () => {
  it("keeps both projects hidden after two successful rapid popover toggles", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1", currentUserId: "account-1" });
    projectStore.setState({
      projects: ["A", "B", "C"].map((id) => ({ id, name: id, organizationId: "org-1" })),
    });
    projectStore.getState().setOrganizationDisplayProjectIds("org-1", ["A", "B", "C"]);
    let savedIds = ["A", "B", "C"];
    const pending = createDeferredPromise<{
      found: boolean;
      value: { isInitialized: boolean; displayProjectIds: string[] };
    }>();
    rpcMocks.filter.mockImplementation((method, params) => {
      if (method === "preferences.get")
        return { found: true, value: { isInitialized: true, displayProjectIds: savedIds } };
      savedIds = params.value.displayProjectIds;
      return rpcMocks.filter.mock.calls.filter(([name]) => name === "preferences.set").length === 1
        ? pending.promise
        : { found: true, value: { isInitialized: true, displayProjectIds: savedIds } };
    });
    renderWithAppTheme(createElement(ProjectFilterPopoverView));
    fireEvent.click(screen.getByRole("button", { name: /project.actions.pin|Pin projects/i }));
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    await vi.waitFor(() => expect(rpcMocks.filter).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    expect(projectStore.getState().displayProjectIds).toEqual(["A", "B", "C"]);
    pending.resolve({ found: true, value: { isInitialized: true, displayProjectIds: ["B", "C"] } });
    await vi.waitFor(() => expect(rpcMocks.filter).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(projectStore.getState().displayProjectIds).toEqual(["C"]));
    expect(savedIds).toEqual(["C"]);
  });

  it.each([false, true])(
    "preserves absent filters when creating before the initial snapshot (pending=%s)",
    async (pendingSnapshot) => {
      sessionStore.setState({ organizations: [{ id: "org-1", name: "Org 1" }], selectedOrganizationId: "org-1" });
      const snapshot = createDeferredPromise<Array<Record<string, unknown>>>();
      rpcMocks.listProjects.mockReturnValueOnce(snapshot.promise);
      const loading = pendingSnapshot ? loadWorkspaceSnapshot() : undefined;
      if (pendingSnapshot) await vi.waitFor(() => expect(rpcMocks.listProjects).toHaveBeenCalledTimes(1));
      apiMocks.createProject.mockResolvedValueOnce(buildCreatedProject("C"));
      await createProject({ name: "C", taskPrefix: "TEST", gitUrl: "https://github.com/test/c.git" });
      expect(projectStore.getState().organizationPreferencesById?.["org-1"]?.displayProjectIds).toBeUndefined();
      expect(
        rpcMocks.filter.mock.calls.filter(
          ([method, params]) => method === "preferences.set" && params.value.displayProjectIds !== undefined,
        ),
      ).toEqual([]);
      const projects = ["A", "B"].map((id) => ({ ...buildSnapshotProject(id), id }));
      projects.push(buildSnapshotProject("C"));
      snapshot.resolve(projects);
      if (loading) await loading;
      else await loadWorkspaceSnapshot();
      expect(projectStore.getState().displayProjectIds).toEqual(["A", "B", "project-created"]);
      expect(projectStore.getState().organizationPreferencesById?.["org-1"]?.displayProjectIds).toBeUndefined();
    },
  );

  it.each([{ savedIds: [] }, { savedIds: ["A", "unavailable"] }])(
    "appends a created project to an explicit filter $savedIds",
    async ({ savedIds }) => {
      sessionStore.setState({ selectedOrganizationId: "org-1" });
      projectStore.getState().setOrganizationDisplayProjectIds("org-1", savedIds);
      apiMocks.createProject.mockResolvedValueOnce(buildCreatedProject("C"));
      await createProject({ name: "C", taskPrefix: "TEST", gitUrl: "https://github.com/test/c.git" });
      expect(projectStore.getState().organizationPreferencesById?.["org-1"]?.displayProjectIds).toEqual([
        ...savedIds,
        "project-created",
      ]);
      expect(rpcMocks.filter.mock.calls.at(-1)?.[1]?.value?.displayProjectIds).toEqual([
        ...savedIds,
        "project-created",
      ]);
    },
  );

  it.each(["account", "org"])("does not hydrate an obsolete org lookup after an %s switch", async (scope) => {
    sessionStore.setState({ organizations: [], selectedOrganizationId: "org-1", currentUserId: "account-1" });
    const organizations = createDeferredPromise<Array<{ id: string; name: string }>>();
    apiMocks.listOrganizations.mockReturnValueOnce(organizations.promise);
    const loading = loadWorkspaceSnapshot();
    await vi.waitFor(() => expect(apiMocks.listOrganizations).toHaveBeenCalledTimes(1));
    sessionStore.setState(scope === "account" ? { currentUserId: "account-2" } : { selectedOrganizationId: "org-2" });
    projectStore.getState().setOrganizationDisplayProjectIds("org-2", ["B"]);
    organizations.resolve([{ id: "org-1", name: "Org 1" }]);
    await loading;
    expect(rpcMocks.filter).not.toHaveBeenCalled();
    expect(rpcMocks.listProjects).not.toHaveBeenCalled();
    expect(projectStore.getState().displayProjectIds).toEqual(["B"]);
  });
});
