// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceAgentIndicatorStore } from "../../../domains/agent/state/workspaceAgentIndicatorStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { closeWorkspace, deleteLocalFolder } from "./workspaceCommands";

const rpcMocks = vi.hoisted(() => ({
  closeWorkspace: vi.fn(),
  deleteLocalFolder: vi.fn(async () => undefined),
  enqueueWorkspaceErrorNotice: vi.fn(),
  enqueueWorkspaceLifecycleWarnings: vi.fn(),
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
      close: rpcMocks.closeWorkspace,
      deleteLocalFolder: rpcMocks.deleteLocalFolder,
    }),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialTabStoreState = tabStore.getState();
const initialWorkspaceAgentIndicatorStoreState = workspaceAgentIndicatorStore.getState();
const initialWorkbenchNavigationStoreState = workbenchNavigationStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  workspaceAgentIndicatorStore.setState(initialWorkspaceAgentIndicatorStoreState, true);
  workbenchNavigationStore.setState(initialWorkbenchNavigationStoreState, true);
  vi.clearAllMocks();
});

describe("workspace close selection", () => {
  it("activates the ordered managed predecessor before resolving tabs after an active close", async () => {
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-a",
          projectId: "project-a",
          repoId: "project-a",
          name: "Workspace A",
          title: "Workspace A",
          summaryId: "workspace-a",
          sourceBranch: "main",
          branch: "feature-a",
        },
        {
          id: "workspace-b",
          projectId: "project-b",
          repoId: "project-b",
          name: "Workspace B",
          title: "Workspace B",
          summaryId: "workspace-b",
          sourceBranch: "main",
          branch: "feature-b",
        },
      ],
      orderedWorkspaceIds: ["workspace-a", "workspace-b"],
    });
    workbenchNavigationStore.setState({ activeWorkspaceId: "workspace-b", activeProjectId: "project-b" });

    await closeWorkspace("workspace-b");

    expect(workbenchNavigationStore.getState()).toMatchObject({
      activeWorkspaceId: "workspace-a",
      activeProjectId: "project-a",
    });
    expect(resolveTabForWorkspace).toHaveBeenCalledTimes(2);
    expect(resolveTabForWorkspace).toHaveBeenNthCalledWith(1, "workspace-a");
    expect(resolveTabForWorkspace).toHaveBeenLastCalledWith("workspace-a");
  });

  it("activates a managed replacement with its project after closing an active folder", async () => {
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-managed",
          projectId: "project-managed",
          repoId: "project-managed",
          name: "Managed workspace",
          title: "Managed workspace",
          summaryId: "workspace-managed",
          sourceBranch: "main",
          branch: "feature-managed",
        },
        {
          id: "folder-1",
          projectId: "local-folder",
          repoId: "folder-1",
          name: "Folder 1",
          title: "Folder 1",
          summaryId: "folder-1",
          sourceBranch: "",
          branch: "",
          kind: "folder",
        },
      ],
      orderedWorkspaceIds: ["workspace-managed", "folder-1"],
    });
    workbenchNavigationStore.setState({ activeWorkspaceId: "folder-1", activeProjectId: "local-folder" });

    await closeWorkspace("folder-1");

    await vi.waitFor(() => {
      expect(workbenchNavigationStore.getState()).toMatchObject({
        activeWorkspaceId: "workspace-managed",
        activeProjectId: "project-managed",
      });
    });
    expect(resolveTabForWorkspace).toHaveBeenCalledTimes(2);
    expect(resolveTabForWorkspace).toHaveBeenNthCalledWith(1, "workspace-managed");
    expect(resolveTabForWorkspace).toHaveBeenLastCalledWith("workspace-managed");
  });

  it("preserves Workbench context when closing a non-active managed workspace", async () => {
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-active",
          projectId: "project-active",
          repoId: "project-active",
          name: "Active workspace",
          title: "Active workspace",
          summaryId: "workspace-active",
          sourceBranch: "main",
          branch: "feature-active",
        },
        {
          id: "workspace-closing",
          projectId: "project-closing",
          repoId: "project-closing",
          name: "Closing workspace",
          title: "Closing workspace",
          summaryId: "workspace-closing",
          sourceBranch: "main",
          branch: "feature-closing",
        },
      ],
      orderedWorkspaceIds: ["workspace-active", "workspace-closing"],
    });
    workbenchNavigationStore.setState({ activeWorkspaceId: "workspace-active", activeProjectId: "project-active" });

    await closeWorkspace("workspace-closing");

    expect(workbenchNavigationStore.getState()).toMatchObject({
      activeWorkspaceId: "workspace-active",
      activeProjectId: "project-active",
    });
    expect(resolveTabForWorkspace).toHaveBeenLastCalledWith("workspace-active");
  });

  it("clears only the active workspace when closing the last active workspace", async () => {
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          projectId: "project-1",
          repoId: "project-1",
          name: "Workspace 1",
          title: "Workspace 1",
          summaryId: "workspace-1",
          sourceBranch: "main",
          branch: "feature-1",
        },
      ],
      orderedWorkspaceIds: ["workspace-1"],
    });
    workbenchNavigationStore.setState({ activeWorkspaceId: "workspace-1", activeProjectId: "project-1" });

    await closeWorkspace("workspace-1");

    expect(workbenchNavigationStore.getState()).toMatchObject({
      activeWorkspaceId: "",
      activeProjectId: "project-1",
    });
    expect(resolveTabForWorkspace).toHaveBeenLastCalledWith("");
  });

  it("preserves a new selection made while deleting an initially active folder", async () => {
    let resolveDaemonDelete: (() => void) | undefined;
    rpcMocks.deleteLocalFolder.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        resolveDaemonDelete = () => resolve(undefined);
      }),
    );
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-replacement",
          projectId: "project-replacement",
          repoId: "project-replacement",
          name: "Replacement workspace",
          title: "Replacement workspace",
          summaryId: "workspace-replacement",
          sourceBranch: "main",
          branch: "feature-replacement",
        },
        {
          id: "workspace-other",
          projectId: "project-other",
          repoId: "project-other",
          name: "Other workspace",
          title: "Other workspace",
          summaryId: "workspace-other",
          sourceBranch: "main",
          branch: "feature-other",
        },
        {
          id: "folder-1",
          projectId: "local-folder",
          repoId: "folder-1",
          name: "Folder 1",
          title: "Folder 1",
          summaryId: "folder-1",
          sourceBranch: "",
          branch: "",
          kind: "folder",
        },
      ],
      orderedWorkspaceIds: ["workspace-replacement", "folder-1", "workspace-other"],
    });
    workbenchNavigationStore.setState({ activeWorkspaceId: "folder-1", activeProjectId: "local-folder" });

    const deletion = deleteLocalFolder("folder-1");
    await vi.waitFor(() => expect(rpcMocks.deleteLocalFolder).toHaveBeenCalledWith({ id: "folder-1" }));
    workbenchNavigationStore.setState({ activeWorkspaceId: "workspace-other", activeProjectId: "project-other" });
    resolveDaemonDelete?.();
    await deletion;

    expect(workbenchNavigationStore.getState()).toMatchObject({
      activeWorkspaceId: "workspace-other",
      activeProjectId: "project-other",
    });
    expect(resolveTabForWorkspace).toHaveBeenLastCalledWith("workspace-other");
  });

  it("selects a replacement when a folder becomes active while deletion is pending", async () => {
    let resolveDaemonDelete: (() => void) | undefined;
    rpcMocks.deleteLocalFolder.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        resolveDaemonDelete = () => resolve(undefined);
      }),
    );
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-other",
          projectId: "project-other",
          repoId: "project-other",
          name: "Other workspace",
          title: "Other workspace",
          summaryId: "workspace-other",
          sourceBranch: "main",
          branch: "feature-other",
        },
        {
          id: "folder-1",
          projectId: "local-folder",
          repoId: "folder-1",
          name: "Folder 1",
          title: "Folder 1",
          summaryId: "folder-1",
          sourceBranch: "",
          branch: "",
          kind: "folder",
        },
      ],
      orderedWorkspaceIds: ["workspace-other", "folder-1"],
    });
    workbenchNavigationStore.setState({ activeWorkspaceId: "workspace-other", activeProjectId: "project-other" });

    const deletion = deleteLocalFolder("folder-1");
    await vi.waitFor(() => expect(rpcMocks.deleteLocalFolder).toHaveBeenCalledWith({ id: "folder-1" }));
    workbenchNavigationStore.setState({ activeWorkspaceId: "folder-1", activeProjectId: "local-folder" });
    resolveDaemonDelete?.();
    await deletion;

    expect(workbenchNavigationStore.getState()).toMatchObject({
      activeWorkspaceId: "workspace-other",
      activeProjectId: "project-other",
    });
    expect(resolveTabForWorkspace).toHaveBeenLastCalledWith("workspace-other");
  });

  it("uses the current workspace order after deferred folder deletion while reconciling original tabs", async () => {
    let resolveDaemonDelete: (() => void) | undefined;
    rpcMocks.deleteLocalFolder.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        resolveDaemonDelete = () => resolve(undefined);
      }),
    );
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ resolveTabForWorkspace });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-a",
          projectId: "project-a",
          repoId: "project-a",
          name: "Workspace A",
          title: "Workspace A",
          summaryId: "workspace-a",
          sourceBranch: "main",
          branch: "feature-a",
        },
        {
          id: "folder-1",
          projectId: "local-folder",
          repoId: "folder-1",
          name: "Folder 1",
          title: "Folder 1",
          summaryId: "folder-1",
          sourceBranch: "",
          branch: "",
          kind: "folder",
        },
        {
          id: "workspace-b",
          projectId: "project-b",
          repoId: "project-b",
          name: "Workspace B",
          title: "Workspace B",
          summaryId: "workspace-b",
          sourceBranch: "main",
          branch: "feature-b",
        },
      ],
      orderedWorkspaceIds: ["workspace-a", "folder-1", "workspace-b"],
    });
    workbenchNavigationStore.setState({ activeWorkspaceId: "folder-1", activeProjectId: "local-folder" });

    const deletion = deleteLocalFolder("folder-1");
    await vi.waitFor(() => expect(rpcMocks.deleteLocalFolder).toHaveBeenCalledWith({ id: "folder-1" }));
    workspaceStore.getState().removeWorkspace({ projectId: "project-a", workspaceId: "workspace-a" });
    resolveDaemonDelete?.();
    await deletion;

    expect(workbenchNavigationStore.getState()).toMatchObject({
      activeWorkspaceId: "workspace-b",
      activeProjectId: "project-b",
    });
    expect(resolveTabForWorkspace).toHaveBeenLastCalledWith("workspace-b");
  });
});
