// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionStore } from "../../../domains/session/state/sessionStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { projectStore } from "../../project/state/projectStore";
import { renameWorkspace, setDisplayRepoIds } from "./workspaceCommands";

const rpcMocks = vi.hoisted(() => ({
  openProject: vi.fn(async () => ({ opened: [], skipped: [], errors: [] })),
  closeProject: vi.fn(async () => ({ stopped: [] })),
}));

vi.mock("@renderer/rpc/client", () => ({
  subscribeConnectionStatus: vi.fn(() => vi.fn()),
  request: async (method: string, params?: { value?: unknown }) =>
    method === "preferences.get"
      ? { found: true, value: { isInitialized: true } }
      : { found: true, value: params?.value },
}));
vi.mock("@renderer/events/desktopRpcEventBus", () => ({ subscribeDesktopRpcEvent: vi.fn(() => vi.fn()) }));
vi.mock("../../../domains/workspace/daemon/daemonWorkspaceClient", () => ({
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  getWorkspaceRpc: () => Promise.resolve({ openProject: rpcMocks.openProject, closeProject: rpcMocks.closeProject }),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialProjectStoreState = projectStore.getState();
const initialSessionStoreState = sessionStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
  projectStore.setState(initialProjectStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  vi.clearAllMocks();
});

describe("workspace project visibility commands", () => {
  it("passes the selected organization to the project visibility action", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    const hydrateOrganizationProjectFilterState = vi.fn();
    const renameWorkspaceState = vi.fn();
    workspaceStore.setState({
      renameWorkspace: renameWorkspaceState,
    });
    projectStore.setState({
      hydrateOrganizationProjectFilter: hydrateOrganizationProjectFilterState,
    });

    await setDisplayRepoIds(["repo-1"]);
    renameWorkspace({ repoId: "repo-1", workspaceId: "workspace-1", name: "next-name" });

    expect(hydrateOrganizationProjectFilterState).toHaveBeenCalledWith("org-1", ["repo-1"]);
    expect(renameWorkspaceState).toHaveBeenCalledWith({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      name: "next-name",
    });
  });
});
