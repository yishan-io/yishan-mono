// @vitest-environment jsdom

import { agentSettingsStore } from "@renderer/domains/agent";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "../../../../domains/project/state/projectStore";
import { workspaceSettingsStore } from "@renderer/domains/workspace";
import { workspaceStore } from "../../../../domains/workspace/state/workspaceStore";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";

const createWorkspace = vi.fn();
const renameWorkspace = vi.fn();
const renameWorkspaceBranch = vi.fn();
const listGitBranches = vi.fn();
const listAgentModels = vi.fn();
const setIsCreatingWorkspace = vi.fn();
const resetDraftInputs = vi.fn();

vi.mock("@renderer/domains/workspace", async () => {
  const { workspaceSettingsStore } = await import("../../state/workspaceSettingsStore");
  const { useWorkspaceBranchPrefixSettings } = await import("../../hooks/useWorkspaceBranchPrefixSettings");
  const { resolveGitBranchPrefix } = await import("../../model/branchPrefix");
  return {
    workspaceSettingsStore,
    useWorkspaceBranchPrefixSettings,
    resolveGitBranchPrefix,
    get createWorkspace() {
      return createWorkspace;
    },
    get renameWorkspace() {
      return renameWorkspace;
    },
    get renameWorkspaceBranch() {
      return renameWorkspaceBranch;
    },
  };
});

vi.mock("@renderer/domains/git", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/git")>();
  return {
    ...actual,
    get listGitBranches() {
      return listGitBranches;
    },
  };
});

vi.mock("@renderer/domains/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/agent")>();
  return {
    ...actual,
    get listAgentModels() {
      return listAgentModels;
    },
  };
});

vi.mock("../../../domains/workbench", () => ({
  useDialogRegistration: () => {},
}));

vi.mock("./useCreateWorkspaceDialogState", () => ({
  useCreateWorkspaceDialogState: () => ({
    selectedProjectId: "repo-1",
    setSelectedProjectId: vi.fn(),
    sourceBranchOptions: ["main"],
    sourceBranchGroups: {
      localBranches: ["main"],
      worktreeBranches: [],
      remoteBranches: [],
    },
    sourceBranch: "main",
    setSourceBranch: vi.fn(),
    sourceBranchMenuAnchorEl: null,
    setSourceBranchMenuAnchorEl: vi.fn(),
    isLoadingSourceBranches: false,
    name: "Node Workspace",
    setName: vi.fn(),
    targetBranch: "node-workspace",
    setTargetBranch: vi.fn(),
    hasEditedTargetBranchRef: { current: false },
    isCreatingWorkspace: false,
    setIsCreatingWorkspace,
    selectedNodeId: "node-2",
    setSelectedNodeId: vi.fn(),
    nodes: [
      { id: "daemon-1", name: "Local Node", scope: "private", canUse: true, isOnline: true },
      { id: "node-2", name: "Shared Node", scope: "shared", canUse: true, isOnline: true },
    ],
    nodesError: "",
    resetDraftInputs,
    selectedWorkspace: undefined,
    defaultBranchPrefix: "",
    taskAgentKind: "",
    setTaskAgentKind: vi.fn(),
    taskPrompt: "",
    setTaskPrompt: vi.fn(),
    taskModel: "",
    setTaskModel: vi.fn(),
  }),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialAgentSettingsStoreState = agentSettingsStore.getState();
const initialWorkspaceSettingsStoreState = workspaceSettingsStore.getState();

describe("CreateWorkspaceDialogView node payload", () => {
  beforeEach(() => {
    workspaceStore.setState(
      {
        ...initialWorkspaceStoreState,
        workspaces: [],
      },
      true,
    );
    projectStore.setState({ displayProjectIds: ["repo-1"] });
    projectStore.setState({});
    agentSettingsStore.setState(
      {
        ...initialAgentSettingsStoreState,
        inUseByAgentKind: {
          opencode: true,
          codex: true,
          claude: true,
          gemini: true,
          pi: true,
          copilot: true,
          cursor: true,
        },
      },
      true,
    );
    workspaceSettingsStore.setState(
      {
        ...initialWorkspaceSettingsStoreState,
        prefixMode: "none",
        customPrefix: "",
      },
      true,
    );
    createWorkspace.mockResolvedValue(undefined);
    listAgentModels.mockResolvedValue({ models: [] });
  });

  afterEach(() => {
    workspaceStore.setState(initialWorkspaceStoreState, true);
    agentSettingsStore.setState(initialAgentSettingsStoreState, true);
    workspaceSettingsStore.setState(initialWorkspaceSettingsStoreState, true);
    cleanup();
    vi.clearAllMocks();
  });

  it("passes the selected node id to createWorkspace", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        name: "Node Workspace",
        sourceBranch: "main",
        targetBranch: "node-workspace",
        nodeId: "node-2",
        taskRun: undefined,
      });
    });
  });
});
