// @vitest-environment jsdom

import { fileTreeStore } from "@renderer/features/files";
import { workbenchNavigationStore } from "@renderer/features/workbench";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../../../features/agent/state/chatStore";
import { sessionStore } from "../../../features/session/state/sessionStore";
import { layoutStore } from "../../../features/workbench/state/layoutStore";
import { tabStore } from "../../../features/workbench/state/tabStore";
import { workspaceCreateProgressStore } from "../../../features/workspace/state/workspaceCreateProgressStore";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";
import { projectStore } from "../../project/state/projectStore";
import {
  OPEN_CREATE_WORKSPACE_DIALOG_EVENT,
  closeWorkspace,
  createWorkspace,
  deleteLocalFolder,
  focusWorkspaceFileTree,
  openCreateWorkspaceDialog,
  openWorkspaceFileSearch,
  renameWorkspace,
  renameWorkspaceBranch,
  setDisplayRepoIds,
  setLastUsedExternalAppId,
} from "./workspaceCommands";

const rpcMocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  list: vi.fn(),
  openWorkspace: vi.fn(),
  openProject: vi.fn(async () => ({ opened: [], skipped: [], errors: [] })),
  closeProject: vi.fn(async () => ({ stopped: [] })),
  closeWorkspace: vi.fn(),
  renameGitBranch: vi.fn(),
  enqueueWorkspaceErrorNotice: vi.fn(),
  enqueueWorkspaceLifecycleWarnings: vi.fn(),
  deleteLocalFolder: vi.fn(async () => undefined),
}));

vi.mock("../../../features/workspace/state/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceErrorNotice: rpcMocks.enqueueWorkspaceErrorNotice,
  enqueueWorkspaceLifecycleWarnings: rpcMocks.enqueueWorkspaceLifecycleWarnings,
}));

vi.mock("../../../rpc/rpcTransport", () => ({
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
  getDaemonClient: vi.fn(async () => ({
    git: {
      renameBranch: rpcMocks.renameGitBranch,
    },
    workspace: {
      createWorkspace: rpcMocks.createWorkspace,
      list: rpcMocks.list,
      open: rpcMocks.openWorkspace,
      openProject: rpcMocks.openProject,
      closeProject: rpcMocks.closeProject,
      close: rpcMocks.closeWorkspace,
      deleteLocalFolder: rpcMocks.deleteLocalFolder,
    },
  })),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialProjectStoreState = projectStore.getState();
const initialLayoutStoreState = layoutStore.getState();
const initialSessionStoreState = sessionStore.getState();
const initialTabStoreState = tabStore.getState();
const initialWorkspaceCreateProgressStoreState = workspaceCreateProgressStore.getState();
const initialChatStoreState = chatStore.getState();

afterEach(() => {
  projectStore.setState(initialProjectStoreState, true);
  workspaceStore.setState(initialWorkspaceStoreState, true);
  layoutStore.setState(initialLayoutStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  workspaceCreateProgressStore.setState(initialWorkspaceCreateProgressStoreState, true);
  chatStore.setState(initialChatStoreState, true);
  vi.clearAllMocks();
});

describe("workspaceCommands", () => {
  it("calls backend service then adds workspace to store", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    const addWorkspace = vi.fn();
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    workspaceStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          localPath: "/tmp/repo-1",
          worktreePath: "/tmp/worktrees",
        },
      ],
      addWorkspace,
    });
    projectStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          localPath: "/tmp/repo-1",
          worktreePath: "/tmp/worktrees",
        },
      ],
    });
    rpcMocks.createWorkspace.mockResolvedValueOnce({
      workspaceId: "workspace-2",
      projectId: "repo-1",
      name: "feature-a",
      sourceBranch: "main",
      branch: "feature-a",
      worktreePath: "~/.yishan/worktrees/repo-1/feature-a",
      status: "active",
    });

    const createdWorkspaceId = await createWorkspace({
      projectId: "repo-1",
      name: "  feature-a  ",
      sourceBranch: " main ",
      targetBranch: " feature-a ",
    });

    expect(createdWorkspaceId).toBe("workspace-2");
    expect(addWorkspace).toHaveBeenCalledWith({
      repoId: "repo-1",
      organizationId: "org-1",
      workspaceId: createdWorkspaceId,
      name: "feature-a",
      sourceBranch: "main",
      branch: "feature-a",
      worktreePath: "",
      nodeId: undefined,
      status: "provisioning",
      preserveOnMissingSnapshot: true,
    });
    await vi.waitFor(() => {
      expect(rpcMocks.createWorkspace).toHaveBeenCalledWith({
        organizationId: "org-1",
        nodeId: undefined,
        projectId: "repo-1",
        repoKey: "repo-1",
        workspaceName: "feature-a",
        sourcePath: "/tmp/repo-1",
        sourceBranch: "main",
        targetBranch: "feature-a",
        contextEnabled: true,
      });
    });
    expect(rpcMocks.list).not.toHaveBeenCalled();
    expect(workspaceCreateProgressStore.getState().progressByWorkspaceId[createdWorkspaceId ?? ""]).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-2",
        isComplete: false,
      }),
    );
    await vi.waitFor(
      () => {
        expect(resolveTabForWorkspace).toHaveBeenCalledTimes(1);
      },
      { timeout: 3_500 },
    );
    expect(rpcMocks.enqueueWorkspaceLifecycleWarnings).not.toHaveBeenCalled();
  });

  it("updates visible repo ids and triggers daemon warmup for newly pinned projects", async () => {
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          projectId: "repo-1",
          name: "Workspace 1",
          title: "Workspace 1",
          sourceBranch: "main",
          branch: "feature-a",
          summaryId: "summary-1",
          worktreePath: "/tmp/workspaces/workspace-1",
        },
      ],
    });
    projectStore.setState({ displayProjectIds: [] });

    setDisplayRepoIds(["repo-1"]);

    expect(projectStore.getState().displayProjectIds).toEqual(["repo-1"]);
    // Warmup fires asynchronously — flush the promise queue.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rpcMocks.openProject).toHaveBeenCalledTimes(1);
    expect(rpcMocks.openProject).toHaveBeenCalledWith({
      workspaces: [
        expect.objectContaining({ workspaceId: "workspace-1", worktreePath: "/tmp/workspaces/workspace-1" }),
      ],
    });
    expect(rpcMocks.closeProject).not.toHaveBeenCalled();
  });

  it("triggers daemon close for removed projects when unpinning", async () => {
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-2",
          repoId: "repo-2",
          projectId: "repo-2",
          name: "Workspace 2",
          title: "Workspace 2",
          sourceBranch: "main",
          branch: "main",
          summaryId: "summary-2",
          worktreePath: "/tmp/workspaces/workspace-2",
        },
      ],
    });
    projectStore.setState({ displayProjectIds: ["repo-1", "repo-2"] });

    setDisplayRepoIds(["repo-1"]);

    expect(projectStore.getState().displayProjectIds).toEqual(["repo-1"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rpcMocks.closeProject).toHaveBeenCalledTimes(1);
    expect(rpcMocks.closeProject).toHaveBeenCalledWith({
      workspaceIds: ["workspace-2"],
    });
    expect(rpcMocks.openProject).not.toHaveBeenCalled();
  });

  it("does not call lifecycle warnings from direct create response (warnings come via workspaceCreateCompleted event)", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    workspaceStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          localPath: "/tmp/repo-1",
          worktreePath: "/tmp/worktrees",
        },
      ],
    });
    projectStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          localPath: "/tmp/repo-1",
          worktreePath: "/tmp/worktrees",
        },
      ],
    });
    rpcMocks.createWorkspace.mockResolvedValueOnce({
      workspaceId: "workspace-2",
      projectId: "repo-1",
      name: "feature-a",
      sourceBranch: "main",
      branch: "feature-a",
      worktreePath: "/tmp/worktrees/feature-a",
      status: "active",
      lifecycleScriptWarnings: [
        {
          scriptKind: "setup",
          timedOut: false,
          message: "Workspace setup script failed.",
          command: "pnpm install",
          stdoutExcerpt: "",
          stderrExcerpt: "error",
          exitCode: 1,
          signal: null,
          logFilePath: "/tmp/.yishan-dev/logs/workspace-lifecycle/setup.log",
        },
      ],
    });

    const createdWorkspaceId = await createWorkspace({
      projectId: "repo-1",
      name: "feature-a",
      sourceBranch: "main",
      targetBranch: "feature-a",
    });

    // In the two-phase flow, createWorkspace returns immediately after reserving
    // the workspace ID. Lifecycle warnings are delivered later via the
    // workspaceCreateCompleted backend event — not from the direct RPC response.
    expect(createdWorkspaceId).toBe("workspace-2");
    expect(rpcMocks.enqueueWorkspaceLifecycleWarnings).not.toHaveBeenCalled();
  });

  it("does not add workspace to store when backend create fails", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    const addWorkspace = vi.fn();
    workspaceStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          localPath: "/tmp/repo-1",
          worktreePath: "/tmp/worktrees",
        },
      ],
      addWorkspace,
    });
    projectStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          localPath: "/tmp/repo-1",
          worktreePath: "/tmp/worktrees",
        },
      ],
    });
    rpcMocks.createWorkspace.mockRejectedValueOnce(new Error("boom"));

    // In the two-phase flow, createWorkspace catches errors and resolves
    // undefined rather than propagating the rejection. An in-app error notice
    // is shown instead.
    const result = await createWorkspace({
      projectId: "repo-1",
      name: "feature-b",
      sourceBranch: "main",
      targetBranch: "feature-b",
    });

    expect(result).toBeUndefined();

    await vi.waitFor(() => {
      expect(rpcMocks.createWorkspace).toHaveBeenCalledTimes(1);
    });
    expect(rpcMocks.list).not.toHaveBeenCalled();
    expect(addWorkspace).not.toHaveBeenCalled();
    expect(rpcMocks.enqueueWorkspaceErrorNotice).toHaveBeenCalledWith({
      title: "Failed to create workspace",
      message: "boom",
    });
  });

  it("deletes local workspace immediately and closes backend workspace in background", async () => {
    const closeWorkspaceAction = vi.fn().mockResolvedValue(undefined);
    const retainWorkspaceTabs = vi.fn().mockReturnValue(["tab-1"]);
    const resolveTabForWorkspace = vi.fn();
    const removeTabData = vi.fn();
    const removeWorkspaceTaskCounts = vi.fn();
    tabStore.setState({ retainWorkspaceTabs, resolveTabForWorkspace });
    chatStore.setState({ removeTabData, removeWorkspaceTaskCounts });
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
          sourceBranch: "",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
      removeWorkspace: closeWorkspaceAction,
    });
    await closeWorkspace("workspace-1");

    expect(closeWorkspaceAction).toHaveBeenCalledWith({ repoId: "repo-1", workspaceId: "workspace-1" });
    expect(retainWorkspaceTabs).toHaveBeenCalledTimes(1);
    expect(resolveTabForWorkspace).toHaveBeenCalledTimes(1);
    expect(removeTabData).toHaveBeenCalledWith(["tab-1"]);
    expect(removeWorkspaceTaskCounts).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(rpcMocks.closeWorkspace).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        organizationId: "org-1",
        projectId: "repo-1",
        branch: "feature-a",
        removeBranch: undefined,
      });
    });
    expect(rpcMocks.enqueueWorkspaceLifecycleWarnings).not.toHaveBeenCalled();
  });

  it("shows system notification when close returns lifecycle script warning", async () => {
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
          sourceBranch: "",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
      removeWorkspace: closeWorkspaceAction,
    });
    rpcMocks.closeWorkspace.mockResolvedValueOnce({
      workspace: { id: "workspace-1", status: "archived" },
      workspaceId: "workspace-1",
      lifecycleScriptWarnings: [
        {
          scriptKind: "post",
          timedOut: false,
          message: "Workspace post script failed.",
          command: "./post.sh",
          stdoutExcerpt: "",
          stderrExcerpt: "failed",
          exitCode: 2,
          signal: null,
          logFilePath: "/tmp/.yishan-dev/logs/workspace-lifecycle/post.log",
        },
      ],
    });

    await closeWorkspace("workspace-1");

    await vi.waitFor(() => {
      expect(rpcMocks.enqueueWorkspaceLifecycleWarnings).toHaveBeenCalledWith({
        workspaceName: "Feature A",
        warnings: [
          {
            scriptKind: "post",
            timedOut: false,
            message: "Workspace post script failed.",
            command: "./post.sh",
            stdoutExcerpt: "",
            stderrExcerpt: "failed",
            exitCode: 2,
            signal: null,
            logFilePath: "/tmp/.yishan-dev/logs/workspace-lifecycle/post.log",
          },
        ],
      });
    });
  });

  it("forwards removeBranch option to backend close", async () => {
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
    await closeWorkspace("workspace-1", { removeBranch: true });
    await vi.waitFor(() => {
      expect(rpcMocks.closeWorkspace).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        organizationId: "org-1",
        projectId: "repo-1",
        branch: "feature-a",
        removeBranch: true,
      });
    });
    expect(closeWorkspaceAction).toHaveBeenCalledWith({ repoId: "repo-1", workspaceId: "workspace-1" });
  });

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

  it("delegates workspace view-state updates to workspace and project stores", () => {
    const setDisplayProjectIdsState = vi.fn();
    const setLastUsedExternalAppIdState = vi.fn();
    const renameWorkspaceState = vi.fn();
    workspaceStore.setState({
      renameWorkspace: renameWorkspaceState,
    });
    projectStore.setState({
      setDisplayProjectIds: setDisplayProjectIdsState,
      setLastUsedExternalAppId: setLastUsedExternalAppIdState,
    });

    setDisplayRepoIds(["repo-1"]);
    setLastUsedExternalAppId("vscode");
    renameWorkspace({ repoId: "repo-1", workspaceId: "workspace-1", name: "next-name" });

    expect(setDisplayProjectIdsState).toHaveBeenCalledWith(["repo-1"]);
    expect(setLastUsedExternalAppIdState).toHaveBeenCalledWith("vscode");
    expect(renameWorkspaceState).toHaveBeenCalledWith({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      name: "next-name",
    });
  });

  it("renames one managed workspace branch through backend and store", async () => {
    const renameWorkspaceBranchState = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "workspace-1",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
          kind: "managed",
        },
      ],
      renameWorkspaceBranch: renameWorkspaceBranchState,
    });
    rpcMocks.renameGitBranch.mockResolvedValueOnce({ ok: true });

    await renameWorkspaceBranch({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      branch: "feature-b",
    });

    expect(rpcMocks.renameGitBranch).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      nextBranch: "feature-b",
    });
    expect(renameWorkspaceBranchState).toHaveBeenCalledWith({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      branch: "feature-b",
    });
  });

  it("does not rename branch for local workspaces", async () => {
    const renameWorkspaceBranchState = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "local",
          title: "local",
          summaryId: "workspace-1",
          sourceBranch: "main",
          branch: "main",
          worktreePath: "/tmp/repo-1",
          kind: "local",
        },
      ],
      renameWorkspaceBranch: renameWorkspaceBranchState,
    });

    await renameWorkspaceBranch({
      repoId: "repo-1",
      workspaceId: "workspace-1",
      branch: "feature-b",
    });

    expect(rpcMocks.renameGitBranch).not.toHaveBeenCalled();
    expect(renameWorkspaceBranchState).not.toHaveBeenCalled();
  });

  it("throws when backend branch rename fails", async () => {
    const renameWorkspaceBranchState = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "workspace-1",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
          kind: "managed",
        },
      ],
      renameWorkspaceBranch: renameWorkspaceBranchState,
    });
    rpcMocks.renameGitBranch.mockRejectedValueOnce(new Error("rename failed"));

    await expect(
      renameWorkspaceBranch({
        repoId: "repo-1",
        workspaceId: "workspace-1",
        branch: "feature-b",
      }),
    ).rejects.toThrow("rename failed");
    expect(renameWorkspaceBranchState).not.toHaveBeenCalled();
  });

  it("shows files pane and focuses file tree when requested", () => {
    workbenchNavigationStore.setState({
      activeWorkspaceId: "ws-test",
    });
    layoutStore.setState({
      isRightPaneHiddenByWorkspaceId: { "ws-test": true },
      rightPaneTabByWorkspaceId: { "ws-test": "changes" },
    });

    const treeArea = document.createElement("div");
    treeArea.setAttribute("data-testid", "repo-file-tree-area");
    treeArea.tabIndex = -1;
    const treeItem = document.createElement("div");
    treeItem.setAttribute("role", "treeitem");
    treeItem.tabIndex = 0;
    treeArea.appendChild(treeItem);
    document.body.appendChild(treeArea);

    focusWorkspaceFileTree();

    expect(layoutStore.getState().isRightPaneHiddenByWorkspaceId["ws-test"]).toBe(false);
    expect(layoutStore.getState().rightPaneTabByWorkspaceId["ws-test"]).toBe("files");
    expect(document.activeElement).toBe(treeItem);

    treeArea.remove();
  });

  it("opens file search without forcing the file tree pane open", () => {
    workbenchNavigationStore.setState({
      activeWorkspaceId: "ws-test",
    });
    layoutStore.setState({
      isRightPaneHiddenByWorkspaceId: { "ws-test": true },
      rightPaneTabByWorkspaceId: { "ws-test": "changes" },
    });
    fileTreeStore.setState({ fileSearchRequestKey: 4 });

    openWorkspaceFileSearch();

    expect(layoutStore.getState().isRightPaneHiddenByWorkspaceId["ws-test"]).toBe(true);
    expect(layoutStore.getState().rightPaneTabByWorkspaceId["ws-test"]).toBe("changes");
    expect(fileTreeStore.getState().fileSearchRequestKey).toBe(5);
  });

  it("dispatches open-create-workspace event using selected repo context", () => {
    workbenchNavigationStore.setState({
      activeProjectId: "repo-1",
    });

    const eventListener = vi.fn();
    window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);

    openCreateWorkspaceDialog();

    expect(eventListener).toHaveBeenCalledTimes(1);
    const dispatchedEvent = eventListener.mock.calls[0]?.[0] as CustomEvent<{ repoId: string }>;
    expect(dispatchedEvent.detail.repoId).toBe("repo-1");

    window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);
  });

  it("does not dispatch open-create-workspace event for a folder workspace", () => {
    workbenchNavigationStore.setState({
      activeProjectId: "local-folder",
      activeWorkspaceId: "folder-workspace-1",
    });
    workspaceStore.setState({
      projects: [],
      workspaces: [
        {
          id: "folder-workspace-1",
          projectId: "local-folder",
          repoId: "folder-workspace-1",
          name: "Folder",
          title: "Folder",
          summaryId: "folder-workspace-1",
          sourceBranch: "",
          branch: "",
          worktreePath: "/tmp/plain-folder",
          kind: "folder",
        },
      ],
    });
    projectStore.setState({ projects: [] });

    const eventListener = vi.fn();
    window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);

    openCreateWorkspaceDialog();

    expect(eventListener).not.toHaveBeenCalled();

    window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);
  });

  it("does not dispatch open-create-workspace event for a non-git project", () => {
    workbenchNavigationStore.setState({
      activeProjectId: "project-plain",
    });
    workspaceStore.setState({
      projects: [{ id: "project-plain", name: "Plain", sourceType: "unknown" }],
    });
    projectStore.setState({ projects: [{ id: "project-plain", name: "Plain", sourceType: "unknown" }] });

    const eventListener = vi.fn();
    window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);

    openCreateWorkspaceDialog();

    expect(eventListener).not.toHaveBeenCalled();

    window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);
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
