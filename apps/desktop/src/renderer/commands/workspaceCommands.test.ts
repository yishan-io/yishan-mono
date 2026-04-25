// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../store/chatStore";
import { layoutStore } from "../store/layoutStore";
import { tabStore } from "../store/tabStore";
import { workspacePaneStore } from "../store/workspacePaneStore";
import { workspaceStore } from "../store/workspaceStore";
import {
  OPEN_CREATE_WORKSPACE_DIALOG_EVENT,
  closeWorkspace,
  createWorkspace,
  focusWorkspaceFileTree,
  openCreateWorkspaceDialog,
  openWorkspaceFileSearch,
  refreshWorkspaceGitChanges,
  renameWorkspace,
  renameWorkspaceBranch,
  setDisplayRepoIds,
  setLastUsedExternalAppId,
  setLeftPaneWidth,
  setRightPaneWidth,
} from "./workspaceCommands";

type WorkspaceListResponse = Array<{
  id: string;
  instance: {
    workspaceId: string;
    repoId: string;
    name: string;
    sourceBranch: string;
    branch: string;
    worktreePath: string;
    status: string;
  } | null;
}>;

const rpcMocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  list: vi.fn(),
  closeWorkspace: vi.fn(),
  listGitChanges: vi.fn(),
  renameGitBranch: vi.fn(),
  enqueueWorkspaceLifecycleWarnings: vi.fn(),
}));

vi.mock("../store/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceLifecycleWarnings: rpcMocks.enqueueWorkspaceLifecycleWarnings,
}));

vi.mock("../rpc/rpcTransport", () => ({
  getApiServiceClient: vi.fn(async () => ({
    git: {
      listChanges: rpcMocks.listGitChanges,
      renameBranch: rpcMocks.renameGitBranch,
    },
    workspace: {
      create: rpcMocks.createWorkspace,
      list: rpcMocks.list,
      close: rpcMocks.closeWorkspace,
    },
  })),
  getDaemonRpcClient: vi.fn(async () => ({
    git: {
      listChanges: rpcMocks.listGitChanges,
      renameBranch: rpcMocks.renameGitBranch,
    },
    workspace: {
      create: rpcMocks.createWorkspace,
      list: rpcMocks.list,
      close: rpcMocks.closeWorkspace,
    },
  })),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialLayoutStoreState = layoutStore.getState();
const initialTabStoreState = tabStore.getState();
const initialWorkspacePaneStoreState = workspacePaneStore.getState();
const initialChatStoreState = chatStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
  layoutStore.setState(initialLayoutStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  workspacePaneStore.setState(initialWorkspacePaneStoreState, true);
  chatStore.setState(initialChatStoreState, true);
  vi.clearAllMocks();
});

describe("workspaceCommands", () => {
  it("calls backend service then adds workspace to store", async () => {
    const addWorkspace = vi.fn();
    const setSelectedWorkspaceId = vi.fn();
    tabStore.setState({ setSelectedWorkspaceId });
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
    rpcMocks.createWorkspace.mockResolvedValueOnce({
      workspace: { id: "workspace-entity-1" },
      workspaceInstance: {
        workspaceId: "workspace-2",
        repoId: "repo-1",
        name: "feature-a",
        sourceBranch: "main",
        branch: "feature-a",
        worktreePath: "/tmp/worktrees/feature-a",
        status: "active",
      },
    });

    await createWorkspace({
      repoId: "repo-1",
      name: "  feature-a  ",
      sourceBranch: " main ",
      targetBranch: " feature-a ",
    });

    expect(rpcMocks.createWorkspace).toHaveBeenCalledWith({
      orgId: "default",
      repositoryId: "repo-1",
      workspaceName: "feature-a",
      sourceBranch: "main",
      targetBranch: "feature-a",
      workspaceWorktreePath: "/tmp/worktrees",
    });
    expect(rpcMocks.list).not.toHaveBeenCalled();
    expect(addWorkspace).toHaveBeenCalledWith({
      repoId: "repo-1",
      workspaceId: "workspace-2",
      name: "feature-a",
      sourceBranch: "main",
      branch: "feature-a",
      worktreePath: "/tmp/worktrees/feature-a",
    });
    expect(setSelectedWorkspaceId).toHaveBeenCalledTimes(1);
    expect(rpcMocks.enqueueWorkspaceLifecycleWarnings).not.toHaveBeenCalled();
  });

  it("shows system notification when create returns lifecycle script warning", async () => {
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
    rpcMocks.createWorkspace.mockResolvedValueOnce({
      workspace: { id: "workspace-entity-1" },
      workspaceInstance: {
        workspaceId: "workspace-2",
        repoId: "repo-1",
        name: "feature-a",
        sourceBranch: "main",
        branch: "feature-a",
        worktreePath: "/tmp/worktrees/feature-a",
        status: "active",
      },
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

    await createWorkspace({
      repoId: "repo-1",
      name: "feature-a",
    });

    expect(rpcMocks.enqueueWorkspaceLifecycleWarnings).toHaveBeenCalledWith({
      workspaceName: "feature-a",
      warnings: [
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
  });

  it("does not add workspace when backend create fails", async () => {
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
    rpcMocks.createWorkspace.mockRejectedValueOnce(new Error("boom"));

    await createWorkspace({
      repoId: "repo-1",
      name: "feature-b",
    });

    expect(rpcMocks.createWorkspace).toHaveBeenCalledTimes(1);
    expect(rpcMocks.list).not.toHaveBeenCalled();
    expect(addWorkspace).not.toHaveBeenCalled();
  });

  it("deletes local workspace immediately and closes backend workspace in background", async () => {
    const deleteWorkspace = vi.fn().mockResolvedValue(undefined);
    const retainWorkspaceTabs = vi.fn().mockReturnValue(["tab-1"]);
    const setSelectedWorkspaceId = vi.fn();
    const removeTabData = vi.fn();
    const removeWorkspaceTaskCounts = vi.fn();
    tabStore.setState({ retainWorkspaceTabs, setSelectedWorkspaceId });
    chatStore.setState({ removeTabData, removeWorkspaceTaskCounts });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          branch: "feature-a",
          sourceBranch: "main",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
      deleteWorkspace,
    });
    rpcMocks.list.mockResolvedValueOnce([
      {
        id: "workspace-entity-1",
        instance: {
          workspaceId: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
          status: "active",
        },
      },
    ]);
    await closeWorkspace("workspace-1");

    expect(deleteWorkspace).toHaveBeenCalledWith({ repoId: "repo-1", workspaceId: "workspace-1" });
    expect(retainWorkspaceTabs).toHaveBeenCalledTimes(1);
    expect(setSelectedWorkspaceId).toHaveBeenCalledTimes(1);
    expect(removeTabData).toHaveBeenCalledWith(["tab-1"]);
    expect(removeWorkspaceTaskCounts).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(rpcMocks.closeWorkspace).toHaveBeenCalledWith({
        workspaceId: "workspace-entity-1",
        removeBranch: undefined,
      });
    });
    expect(rpcMocks.enqueueWorkspaceLifecycleWarnings).not.toHaveBeenCalled();
  });

  it("shows system notification when close returns lifecycle script warning", async () => {
    const deleteWorkspace = vi.fn().mockResolvedValue(undefined);
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          branch: "feature-a",
          sourceBranch: "main",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
      deleteWorkspace,
    });
    rpcMocks.list.mockResolvedValueOnce([
      {
        id: "workspace-entity-1",
        instance: {
          workspaceId: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
          status: "active",
        },
      },
    ]);
    rpcMocks.closeWorkspace.mockResolvedValueOnce({
      workspace: { id: "workspace-entity-1", status: "archived" },
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
    const deleteWorkspace = vi.fn().mockResolvedValue(undefined);
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          branch: "feature-a",
          sourceBranch: "main",
          worktreePath: "",
        },
      ],
      deleteWorkspace,
    });
    rpcMocks.list.mockResolvedValueOnce([
      {
        id: "workspace-entity-1",
        instance: {
          workspaceId: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "",
          status: "active",
        },
      },
    ]);
    await closeWorkspace("workspace-1", { removeBranch: true });
    await vi.waitFor(() => {
      expect(rpcMocks.closeWorkspace).toHaveBeenCalledWith({
        workspaceId: "workspace-entity-1",
        removeBranch: true,
      });
    });
    expect(deleteWorkspace).toHaveBeenCalledWith({ repoId: "repo-1", workspaceId: "workspace-1" });
  });

  it("does nothing when closing a missing workspace", async () => {
    const deleteWorkspace = vi.fn().mockResolvedValue(undefined);
    workspaceStore.setState({
      workspaces: [],
      deleteWorkspace,
    });

    await closeWorkspace("workspace-404");

    expect(rpcMocks.closeWorkspace).not.toHaveBeenCalled();
    expect(deleteWorkspace).not.toHaveBeenCalled();
  });

  it("returns before backend close completes so UI is non-blocking", async () => {
    const deleteWorkspace = vi.fn().mockResolvedValue(undefined);
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          branch: "feature-a",
          sourceBranch: "main",
          worktreePath: "",
        },
      ],
      deleteWorkspace,
    });

    let resolveList: ((value: WorkspaceListResponse) => void) | undefined;
    rpcMocks.list.mockReturnValueOnce(
      new Promise<WorkspaceListResponse>((resolve) => {
        resolveList = resolve;
      }),
    );
    await closeWorkspace("workspace-1");

    expect(deleteWorkspace).toHaveBeenCalledWith({ repoId: "repo-1", workspaceId: "workspace-1" });
    expect(rpcMocks.closeWorkspace).not.toHaveBeenCalled();

    resolveList?.([
      {
        id: "workspace-entity-1",
        instance: {
          workspaceId: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "",
          status: "active",
        },
      },
    ]);
    await vi.waitFor(() => {
      expect(rpcMocks.closeWorkspace).toHaveBeenCalledWith({
        workspaceId: "workspace-entity-1",
        removeBranch: undefined,
      });
    });
  });

  it("refreshes git changes count through backend service", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({ setWorkspaceGitChangesCount, setWorkspaceGitChangeTotals });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [{ path: "a.ts", kind: "modified", additions: 1, deletions: 0 }],
      unstaged: [{ path: "b.ts", kind: "modified", additions: 2, deletions: 1 }],
      untracked: [{ path: "c.ts", kind: "added", additions: 0, deletions: 0 }],
    });

    await refreshWorkspaceGitChanges("workspace-1", "/tmp/repo-1/.worktrees/existing");

    expect(rpcMocks.listGitChanges).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/repo-1/.worktrees/existing",
    });
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 3);
    expect(setWorkspaceGitChangeTotals).toHaveBeenCalledWith("workspace-1", {
      additions: 3,
      deletions: 1,
    });
  });

  it("delegates workspace view-state updates to workspace and layout stores", () => {
    const setDisplayProjectIdsState = vi.fn();
    const setLastUsedExternalAppIdState = vi.fn();
    const setLeftWidth = vi.fn();
    const setRightWidth = vi.fn();
    const renameWorkspaceState = vi.fn();
    workspaceStore.setState({
      setDisplayProjectIds: setDisplayProjectIdsState,
      setLastUsedExternalAppId: setLastUsedExternalAppIdState,
      renameWorkspace: renameWorkspaceState,
    });
    layoutStore.setState({ setLeftWidth, setRightWidth });

    setDisplayRepoIds(["repo-1"]);
    setLastUsedExternalAppId("vscode");
    setLeftPaneWidth(320);
    setRightPaneWidth(420);
    renameWorkspace({ repoId: "repo-1", workspaceId: "workspace-1", name: "next-name" });

    expect(setDisplayProjectIdsState).toHaveBeenCalledWith(["repo-1"]);
    expect(setLastUsedExternalAppIdState).toHaveBeenCalledWith("vscode");
    expect(setLeftWidth).toHaveBeenCalledWith(320);
    expect(setRightWidth).toHaveBeenCalledWith(420);
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
      workspaceWorktreePath: "/tmp/worktrees/feature-a",
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
    layoutStore.setState({ isRightPaneManuallyHidden: true });
    workspacePaneStore.setState({ rightPaneTab: "changes" });

    const treeArea = document.createElement("div");
    treeArea.setAttribute("data-testid", "repo-file-tree-area");
    treeArea.tabIndex = -1;
    const treeItem = document.createElement("div");
    treeItem.setAttribute("role", "treeitem");
    treeItem.tabIndex = 0;
    treeArea.appendChild(treeItem);
    document.body.appendChild(treeArea);

    focusWorkspaceFileTree();

    expect(layoutStore.getState().isRightPaneManuallyHidden).toBe(false);
    expect(workspacePaneStore.getState().rightPaneTab).toBe("files");
    expect(document.activeElement).toBe(treeItem);

    treeArea.remove();
  });

  it("opens file search without forcing the file tree pane open", () => {
    layoutStore.setState({ isRightPaneManuallyHidden: true });
    workspacePaneStore.setState({ rightPaneTab: "changes", fileSearchRequestKey: 4 });

    openWorkspaceFileSearch();

    expect(layoutStore.getState().isRightPaneManuallyHidden).toBe(true);
    expect(workspacePaneStore.getState().rightPaneTab).toBe("changes");
    expect(workspacePaneStore.getState().fileSearchRequestKey).toBe(5);
  });

  it("dispatches open-create-workspace event using selected repo context", () => {
    workspaceStore.setState({
      selectedProjectId: "repo-1",
    });

    const eventListener = vi.fn();
    window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);

    openCreateWorkspaceDialog();

    expect(eventListener).toHaveBeenCalledTimes(1);
    const dispatchedEvent = eventListener.mock.calls[0]?.[0] as CustomEvent<{ repoId: string }>;
    expect(dispatchedEvent.detail.repoId).toBe("repo-1");

    window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);
  });
});
