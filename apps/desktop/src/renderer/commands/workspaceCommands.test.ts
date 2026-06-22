// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../store/chatStore";
import { sessionStore } from "../store/sessionStore";
import { layoutStore } from "../store/settings/layoutStore";
import { tabStore } from "../store/tabStore";
import { workspaceCreateProgressStore } from "../store/workspaceCreateProgressStore";
import { workspaceStore } from "../store/workspaceStore";
import { workspaceUiStore } from "../store/workspaceUiStore";
import {
  OPEN_CREATE_WORKSPACE_DIALOG_EVENT,
  closeWorkspace,
  createWorkspace,
  focusWorkspaceFileTree,
  openCreateWorkspaceDialog,
  openWorkspaceFileSearch,
  refreshWorkspaceGitChanges,
  refreshWorkspacePullRequest,
  renameWorkspace,
  renameWorkspaceBranch,
  setDisplayRepoIds,
  setLastUsedExternalAppId,
  setLeftPaneWidth,
  setRightPaneWidth,
} from "./workspaceCommands";

const rpcMocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  list: vi.fn(),
  openWorkspace: vi.fn(),
  openProject: vi.fn(async () => ({ opened: [], skipped: [], errors: [] })),
  closeProject: vi.fn(async () => ({ stopped: [] })),
  refreshWorkspacePullRequest: vi.fn(),
  closeWorkspace: vi.fn(),
  listGitChanges: vi.fn(),
  getBranchDiffSummary: vi.fn(),
  renameGitBranch: vi.fn(),
  gitInspect: vi.fn(async () => ({ isGitRepository: true })),
  enqueueWorkspaceErrorNotice: vi.fn(),
  enqueueWorkspaceLifecycleWarnings: vi.fn(),
}));

vi.mock("../store/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceErrorNotice: rpcMocks.enqueueWorkspaceErrorNotice,
  enqueueWorkspaceLifecycleWarnings: rpcMocks.enqueueWorkspaceLifecycleWarnings,
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    git: {
      inspectPath: rpcMocks.gitInspect,
      listChanges: rpcMocks.listGitChanges,
      getBranchDiffSummary: rpcMocks.getBranchDiffSummary,
      renameBranch: rpcMocks.renameGitBranch,
    },
    workspace: {
      createWorkspace: rpcMocks.createWorkspace,
      list: rpcMocks.list,
      open: rpcMocks.openWorkspace,
      openProject: rpcMocks.openProject,
      closeProject: rpcMocks.closeProject,
      refreshPullRequest: rpcMocks.refreshWorkspacePullRequest,
      close: rpcMocks.closeWorkspace,
    },
  })),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialLayoutStoreState = layoutStore.getState();
const initialSessionStoreState = sessionStore.getState();
const initialTabStoreState = tabStore.getState();
const initialWorkspaceCreateProgressStoreState = workspaceCreateProgressStore.getState();
const initialWorkspacePaneStoreState = workspaceUiStore.getState();
const initialChatStoreState = chatStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
  layoutStore.setState(initialLayoutStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  workspaceCreateProgressStore.setState(initialWorkspaceCreateProgressStoreState, true);
  workspaceUiStore.setState(initialWorkspacePaneStoreState, true);
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
          sourceBranch: "",
          branch: "feature-a",
          summaryId: "summary-1",
          worktreePath: "/tmp/workspaces/workspace-1",
        },
      ],
      displayProjectIds: [],
    });

    setDisplayRepoIds(["repo-1"]);

    expect(workspaceStore.getState().displayProjectIds).toEqual(["repo-1"]);
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
          sourceBranch: "",
          branch: "main",
          summaryId: "summary-2",
          worktreePath: "/tmp/workspaces/workspace-2",
        },
      ],
      displayProjectIds: ["repo-1", "repo-2"],
    });

    setDisplayRepoIds(["repo-1"]);

    expect(workspaceStore.getState().displayProjectIds).toEqual(["repo-1"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rpcMocks.closeProject).toHaveBeenCalledTimes(1);
    expect(rpcMocks.closeProject).toHaveBeenCalledWith({
      workspaceIds: ["workspace-2"],
    });
    expect(rpcMocks.openProject).not.toHaveBeenCalled();
  });

  it("refreshes one workspace pull request through the daemon", async () => {
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          projectId: "repo-1",
          organizationId: "org-1",
          name: "Workspace 1",
          title: "Workspace 1",
          sourceBranch: "",
          branch: "feature-a",
          summaryId: "summary-1",
          worktreePath: "/tmp/workspaces/workspace-1",
        },
      ],
    });
    rpcMocks.refreshWorkspacePullRequest.mockResolvedValueOnce({
      id: "workspace-1",
      pullRequest: {
        number: 42,
        title: "Add refresh button",
        status: "OPEN",
      },
    });

    await refreshWorkspacePullRequest("workspace-1");

    expect(rpcMocks.refreshWorkspacePullRequest).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    });
    expect(workspaceStore.getState().pullRequestByWorkspaceId["workspace-1"]).toEqual({
      number: 42,
      title: "Add refresh button",
      status: "OPEN",
    });
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
          sourceBranch: "main",
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
          sourceBranch: "main",
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

  it("refreshes git changes count through backend service", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Existing",
          title: "Existing",
          summaryId: "",
          sourceBranch: "",
          branch: "feature-a",
          worktreePath: "/tmp/repo-1/.worktrees/existing",
        },
      ],
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [{ path: "a.ts", kind: "modified", additions: 1, deletions: 0 }],
      unstaged: [{ path: "b.ts", kind: "modified", additions: 2, deletions: 1 }],
      untracked: [{ path: "c.ts", kind: "added", additions: 0, deletions: 0 }],
    });

    await refreshWorkspaceGitChanges("workspace-1");

    expect(rpcMocks.listGitChanges).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    });
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 3);
    expect(setWorkspaceGitChangeTotals).toHaveBeenCalledWith("workspace-1", {
      additions: 3,
      deletions: 1,
    });
  });

  it("combines branch diff summary with uncommitted changes when sourceBranch is configured", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [{ path: "a.ts", kind: "modified", additions: 1, deletions: 0 }],
      unstaged: [],
      untracked: [],
    });
    rpcMocks.getBranchDiffSummary.mockResolvedValueOnce({
      fileCount: 5,
      additions: 40,
      deletions: 10,
      files: ["b.ts", "c.ts", "d.ts", "e.ts", "f.ts"],
    });

    await refreshWorkspaceGitChanges("workspace-1");

    expect(rpcMocks.getBranchDiffSummary).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      targetBranch: "origin/main",
    });
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 6);
    expect(setWorkspaceGitChangeTotals).toHaveBeenCalledWith("workspace-1", {
      additions: 41,
      deletions: 10,
    });
  });

  it("deduplicates overlapping files between branch diff and uncommitted changes", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [{ path: "a.ts", kind: "modified", additions: 1, deletions: 0 }],
      unstaged: [{ path: "b.ts", kind: "modified", additions: 2, deletions: 1 }],
      untracked: [],
    });
    rpcMocks.getBranchDiffSummary.mockResolvedValueOnce({
      fileCount: 2,
      additions: 40,
      deletions: 10,
      files: ["a.ts", "c.ts"],
    });

    await refreshWorkspaceGitChanges("workspace-1");

    // a.ts appears in both branch diff and staged; b.ts and c.ts are unique. Total unique = 3.
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 3);
  });

  it("reconciles rename-like delete+add pairs so badge matches changes tab count", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [],
      unstaged: [
        { path: "AGENTS.md", kind: "deleted", additions: 0, deletions: 81 },
        { path: "src/main/ipc.ts", kind: "modified", additions: 1, deletions: 1 },
        { path: "sample.jsonl", kind: "deleted", additions: 0, deletions: 10 },
      ],
      untracked: [
        { path: "AGENTS1.md", kind: "added", additions: 0, deletions: 0 },
        { path: ".superset/config.json", kind: "added", additions: 0, deletions: 0 },
      ],
    });
    rpcMocks.getBranchDiffSummary.mockResolvedValueOnce({
      fileCount: 0,
      additions: 0,
      deletions: 0,
      files: [],
    });

    await refreshWorkspaceGitChanges("workspace-1");

    // AGENTS.md (deleted) + AGENTS1.md (added) reconciled as one rename.
    // sample.jsonl (deleted) should NOT be reconciled with .superset/config.json (different extension/path context).
    // ipc.ts (modified) stays.
    // Total unique after reconciliation = 4.
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 4);
  });

  it("falls back to uncommitted-only count when branch diff summary fails", async () => {
    const setWorkspaceGitChangesCount = vi.fn();
    const setWorkspaceGitChangeTotals = vi.fn();
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Feature A",
          title: "Feature A",
          summaryId: "",
          sourceBranch: "main",
          branch: "feature-a",
          worktreePath: "/tmp/worktrees/feature-a",
        },
      ],
      setWorkspaceGitChangesCount,
      setWorkspaceGitChangeTotals,
    });
    rpcMocks.listGitChanges.mockResolvedValueOnce({
      staged: [],
      unstaged: [{ path: "b.ts", kind: "modified", additions: 2, deletions: 1 }],
      untracked: [],
    });
    rpcMocks.getBranchDiffSummary.mockRejectedValueOnce(new Error("target branch not found"));

    await refreshWorkspaceGitChanges("workspace-1");

    // Should fall back to uncommitted-only count
    expect(setWorkspaceGitChangesCount).toHaveBeenCalledWith("workspace-1", 1);
    expect(setWorkspaceGitChangeTotals).toHaveBeenCalledWith("workspace-1", {
      additions: 2,
      deletions: 1,
    });
  });

  it("delegates workspace view-state updates to workspace and layout stores", () => {
    const setDisplayProjectIdsState = vi.fn();
    const setLastUsedExternalAppIdState = vi.fn();
    const setLeftPaneWidth = vi.fn();
    const setRightPaneWidth = vi.fn();
    const renameWorkspaceState = vi.fn();
    workspaceStore.setState({
      setDisplayProjectIds: setDisplayProjectIdsState,
      setLastUsedExternalAppId: setLastUsedExternalAppIdState,
      renameWorkspace: renameWorkspaceState,
    });
    layoutStore.setState({ setLeftPaneWidth, setRightPaneWidth });

    setDisplayRepoIds(["repo-1"]);
    setLastUsedExternalAppId("vscode");
    setLeftPaneWidth(320);
    setRightPaneWidth(420);
    renameWorkspace({ repoId: "repo-1", workspaceId: "workspace-1", name: "next-name" });

    expect(setDisplayProjectIdsState).toHaveBeenCalledWith(["repo-1"]);
    expect(setLastUsedExternalAppIdState).toHaveBeenCalledWith("vscode");
    expect(setLeftPaneWidth).toHaveBeenCalledWith(320);
    expect(setRightPaneWidth).toHaveBeenCalledWith(420);
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
    workspaceStore.setState({ selectedWorkspaceId: "ws-test" });
    workspaceUiStore.setState({
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

    expect(workspaceUiStore.getState().isRightPaneHiddenByWorkspaceId["ws-test"]).toBe(false);
    expect(workspaceUiStore.getState().rightPaneTabByWorkspaceId["ws-test"]).toBe("files");
    expect(document.activeElement).toBe(treeItem);

    treeArea.remove();
  });

  it("opens file search without forcing the file tree pane open", () => {
    workspaceStore.setState({ selectedWorkspaceId: "ws-test" });
    workspaceUiStore.setState({
      isRightPaneHiddenByWorkspaceId: { "ws-test": true },
      rightPaneTabByWorkspaceId: { "ws-test": "changes" },
      fileSearchRequestKey: 4,
    });

    openWorkspaceFileSearch();

    expect(workspaceUiStore.getState().isRightPaneHiddenByWorkspaceId["ws-test"]).toBe(true);
    expect(workspaceUiStore.getState().rightPaneTabByWorkspaceId["ws-test"]).toBe("changes");
    expect(workspaceUiStore.getState().fileSearchRequestKey).toBe(5);
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
