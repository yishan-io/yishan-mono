// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceAgentIndicatorStore } from "../../../domains/agent/state/workspaceAgentIndicatorStore";
import { sessionStore } from "../../../domains/session/state/sessionStore";
import { layoutStore } from "../../../domains/workbench/state/layoutStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { projectStore } from "../../project/state/projectStore";
import { closeWorkspace, deleteLocalFolder } from "./workspaceCommands";

const rpcMocks = vi.hoisted(() => ({
  openProject: vi.fn(async () => ({ opened: [], skipped: [], errors: [] })),
  closeProject: vi.fn(async () => ({ stopped: [] })),
  closeWorkspace: vi.fn(),
  renameGitBranch: vi.fn(),
  enqueueWorkspaceErrorNotice: vi.fn(),
  enqueueWorkspaceLifecycleWarnings: vi.fn(),
  deleteLocalFolder: vi.fn(async () => undefined),
}));

vi.mock("../../../domains/workspace/state/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceErrorNotice: rpcMocks.enqueueWorkspaceErrorNotice,
  enqueueWorkspaceLifecycleWarnings: rpcMocks.enqueueWorkspaceLifecycleWarnings,
}));

vi.mock("@renderer/rpc", () => ({
  subscribeConnectionStatus: vi.fn(() => vi.fn()),
}));

vi.mock("@renderer/events/desktopRpcEventBus", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
}));

vi.mock("../../../domains/workspace/daemon/daemonWorkspaceClient", () => ({
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  getWorkspaceRpc: () =>
    Promise.resolve({
      openProject: rpcMocks.openProject,
      closeProject: rpcMocks.closeProject,
      close: rpcMocks.closeWorkspace,
      deleteLocalFolder: rpcMocks.deleteLocalFolder,
    }),
}));

vi.mock("../../../domains/git/daemon/daemonGitClient", () => ({
  getGitRpc: () =>
    Promise.resolve({
      renameBranch: rpcMocks.renameGitBranch,
    }),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialProjectStoreState = projectStore.getState();
const initialLayoutStoreState = layoutStore.getState();
const initialSessionStoreState = sessionStore.getState();
const initialWorkspaceAgentIndicatorStoreState = workspaceAgentIndicatorStore.getState();
const initialTabStoreState = tabStore.getState();
const initialWorkbenchNavigationStoreState = workbenchNavigationStore.getState();

afterEach(() => {
  projectStore.setState(initialProjectStoreState, true);
  workspaceStore.setState(initialWorkspaceStoreState, true);
  layoutStore.setState(initialLayoutStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  workspaceAgentIndicatorStore.setState(initialWorkspaceAgentIndicatorStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  workbenchNavigationStore.setState(initialWorkbenchNavigationStoreState, true);
  vi.clearAllMocks();
});

describe("workspaceCommands close behavior", () => {
  it("shows in-app error notification when background workspace close fails", async () => {
    const closeWorkspaceAction = vi.fn().mockResolvedValue(undefined);
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          branch: "feature-a",
          sourceBranch: "main",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
      removeWorkspace: closeWorkspaceAction,
    });
    rpcMocks.closeWorkspace.mockRejectedValueOnce(new Error("daemon RPC error -32000: server unavailable"));

    await closeWorkspace("workspace-1");

    await vi.waitFor(() => {
      expect(rpcMocks.enqueueWorkspaceErrorNotice).toHaveBeenCalledWith({
        title: "Failed to close workspace",
        message: 'Workspace "Feature A" was not closed. Try closing it again. server unavailable',
      });
    });
  });

  it("does not show close failure notification when background workspace close succeeds", async () => {
    const closeWorkspaceAction = vi.fn().mockResolvedValue(undefined);
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          branch: "feature-a",
          sourceBranch: "main",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
      removeWorkspace: closeWorkspaceAction,
    });
    rpcMocks.closeWorkspace.mockResolvedValueOnce({
      workspace: { id: "workspace-1", status: "archived" },
      workspaceId: "workspace-1",
      lifecycleScriptWarnings: [],
    });

    await closeWorkspace("workspace-1");

    await vi.waitFor(() => {
      expect(rpcMocks.closeWorkspace).toHaveBeenCalledTimes(1);
    });
    expect(rpcMocks.enqueueWorkspaceErrorNotice).not.toHaveBeenCalled();
  });

  it("does nothing when closing a missing workspace", async () => {
    const closeWorkspaceAction = vi.fn().mockResolvedValue(undefined);
    workspaceStore.setState({
      workspaces: [],
      removeWorkspace: closeWorkspaceAction,
    });

    await closeWorkspace("workspace-404");

    expect(rpcMocks.closeWorkspace).not.toHaveBeenCalled();
    expect(closeWorkspaceAction).not.toHaveBeenCalled();
  });

  it("closing a folder routes to deleteLocalFolder instead of workspace.close", async () => {
    const removeLocalFolderAction = vi.fn().mockResolvedValue(undefined);
    const removeWorkspaceAction = vi.fn().mockResolvedValue(undefined);
    const retainWorkspaceTabs = vi.fn().mockReturnValue([]);
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ retainWorkspaceTabs, resolveTabForWorkspace });
    workspaceStore.setState({
      workspaces: [
        {
          id: "folder-1",
          projectId: "local-folder",
          repoId: "folder-1",
          name: "Folder 1",
          title: "Folder 1",
          summaryId: "folder-1",
          branch: "",
          sourceBranch: "",
          worktreePath: "/tmp/folder-1",
          kind: "folder",
        },
      ],
      removeLocalFolder: removeLocalFolderAction,
      removeWorkspace: removeWorkspaceAction,
    });

    await closeWorkspace("folder-1");

    // Folder closes must delete the daemon row, never run the workspace-close
    // path (which would mark the row 'closed' and resurrect it next snapshot).
    expect(rpcMocks.closeWorkspace).not.toHaveBeenCalled();
    expect(rpcMocks.deleteLocalFolder).toHaveBeenCalledWith({ id: "folder-1" });
    expect(removeWorkspaceAction).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(removeLocalFolderAction).toHaveBeenCalledWith("folder-1");
    });
  });

  it("returns before backend close completes so UI is non-blocking", async () => {
    const closeWorkspaceAction = vi.fn().mockResolvedValue(undefined);
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          organizationId: "org-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          branch: "feature-a",
          sourceBranch: "main",
          worktreePath: "",
        },
      ],
      removeWorkspace: closeWorkspaceAction,
    });

    let resolveClose: (() => void) | undefined;
    rpcMocks.closeWorkspace.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveClose = () => {
          resolve({
            workspace: { id: "workspace-1", status: "closed" },
            workspaceId: "workspace-1",
            lifecycleScriptWarnings: [],
          });
        };
      }),
    );
    await closeWorkspace("workspace-1");

    expect(closeWorkspaceAction).toHaveBeenCalledWith({ repoId: "repo-1", workspaceId: "workspace-1" });
    expect(rpcMocks.closeWorkspace).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      organizationId: "org-1",
      projectId: "repo-1",
      workspaceWorktreePath: undefined,
      branch: "feature-a",
      removeBranch: undefined,
    });

    resolveClose?.();
  });





  it("deletes a local folder on the daemon and removes it from store state", async () => {
    const removeLocalFolder = vi.fn();
    const retainWorkspaceTabs = vi.fn().mockReturnValue([]);
    const resolveTabForWorkspace = vi.fn();
    workspaceStore.setState({ removeLocalFolder });
    tabStore.setState({
      retainWorkspaceTabs,
      resolveTabForWorkspace,
      tabs: [],
    });

    await deleteLocalFolder("folder-1");

    expect(rpcMocks.deleteLocalFolder).toHaveBeenCalledWith({ id: "folder-1" });
    expect(removeLocalFolder).toHaveBeenCalledWith("folder-1");
    expect(retainWorkspaceTabs).toHaveBeenCalledTimes(1);
    expect(resolveTabForWorkspace).toHaveBeenCalledTimes(1);
  });

  it("does not call the daemon when deleting an empty local folder id", async () => {
    await deleteLocalFolder("  ");

    expect(rpcMocks.deleteLocalFolder).not.toHaveBeenCalled();
  });

});
