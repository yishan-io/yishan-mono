// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentSettingsStore } from "../../../store/settings/agentSettingsStore";
import { workspaceSettingsStore } from "../../../store/settings/workspaceSettingsStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";

const createWorkspace = vi.fn();
const renameWorkspace = vi.fn();
const renameWorkspaceBranch = vi.fn();
const listGitBranches = vi.fn();
const listAgentModels = vi.fn();
const setIsCreatingWorkspace = vi.fn();
const resetDraftInputs = vi.fn();

vi.mock("../../../hooks/useCommands", () => ({
  useCommands: () => ({
    createWorkspace,
    renameWorkspace,
    renameWorkspaceBranch,
    listGitBranches,
    listAgentModels,
  }),
}));

vi.mock("../../../hooks/useDialogRegistration", () => ({
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
        displayProjectIds: ["repo-1"],
        projects: [
          {
            id: "repo-1",
            key: "repo-1",
            name: "Repo One",
            path: "/tmp/repo-1",
            localPath: "/tmp/repo-1",
            worktreePath: "/tmp/worktrees-1",
            defaultBranch: "main",
            missing: false,
          },
        ],
        workspaces: [],
      },
      true,
    );
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
        defaultAgentKind: undefined,
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
