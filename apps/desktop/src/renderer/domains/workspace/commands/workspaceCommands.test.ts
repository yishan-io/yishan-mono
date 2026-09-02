// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../../../domains/agent/state/chatStore";
import { sessionStore } from "../../../domains/session/state/sessionStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceCreateProgressStore } from "../../../domains/workspace/state/workspaceCreateProgressStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { projectStore } from "../../project/state/projectStore";
import { closeWorkspace, createWorkspace, setDisplayRepoIds } from "./workspaceCommands";

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
      createWorkspace: rpcMocks.createWorkspace,
      list: rpcMocks.list,
      open: rpcMocks.openWorkspace,
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
const initialSessionStoreState = sessionStore.getState();
const initialTabStoreState = tabStore.getState();
const initialWorkspaceCreateProgressStoreState = workspaceCreateProgressStore.getState();
const initialChatStoreState = chatStore.getState();

afterEach(() => {
  projectStore.setState(initialProjectStoreState, true);
  workspaceStore.setState(initialWorkspaceStoreState, true);
  sessionStore.setState(initialSessionStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  workspaceCreateProgressStore.setState(initialWorkspaceCreateProgressStoreState, true);
  chatStore.setState(initialChatStoreState, true);
  vi.clearAllMocks();
});

describe("workspaceCommands", () => {
  it("calls backend service without adding or activating a workspace", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
    const addWorkspace = vi.fn();
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    workspaceStore.setState({
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
    expect(addWorkspace).not.toHaveBeenCalled();
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
    expect(resolveTabForWorkspace).not.toHaveBeenCalled();
    expect(rpcMocks.enqueueWorkspaceLifecycleWarnings).not.toHaveBeenCalled();
  });

  it("updates the selected organization visibility preference and triggers daemon warmup for newly pinned projects", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });
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
    projectStore.setState({
      displayProjectIds: [],
      projects: [{ id: "repo-1", name: "Repo 1" }],
    });

    setDisplayRepoIds(["repo-1"]);

    expect(projectStore.getState().displayProjectIds).toEqual(["repo-1"]);
    expect(projectStore.getState().organizationPreferencesById).toEqual({
      "org-1": { displayProjectIds: ["repo-1"], knownProjectIds: ["repo-1"] },
    });
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

  it("does not create an organization preference when no organization is selected", () => {
    sessionStore.setState({ selectedOrganizationId: undefined });
    projectStore.setState({
      organizationPreferencesById: {
        "org-1": { displayProjectIds: ["repo-1"], knownProjectIds: ["repo-1"] },
      },
    });

    setDisplayRepoIds(["repo-2"]);

    expect(projectStore.getState().displayProjectIds).toEqual(["repo-2"]);
    expect(projectStore.getState().organizationPreferencesById).toEqual({
      "org-1": { displayProjectIds: ["repo-1"], knownProjectIds: ["repo-1"] },
    });
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
    workspaceStore.setState({});
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
});
