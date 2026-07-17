// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";
import { sessionStore } from "../../../store/sessionStore";
import { agentSettingsStore } from "../../../store/settings/agentSettingsStore";
import { workspaceSettingsStore } from "../../../store/settings/workspaceSettingsStore";
import { workspaceStore } from "../../../store/workspaceStore";

import { getMockedCommands, resetMockedCommands } from "./CreateWorkspaceDialogView.testSetup";

export { getMockedCommands };

const defaultAgentSettingsState = {
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
  customCommandByAgentKind: {},
};

const initialWorkspaceStoreState = workspaceStore.getState();
const initialWorkspaceSettingsStoreState = workspaceSettingsStore.getState();
const initialSessionStoreState = sessionStore.getState();

export function renderDialog(ui: ReactElement) {
  const result = render(<MemoryRouter initialEntries={["/"]}>{ui}</MemoryRouter>);

  return {
    ...result,
    rerender: (nextUi: ReactElement) => {
      result.rerender(<MemoryRouter initialEntries={["/"]}>{nextUi}</MemoryRouter>);
    },
  };
}

function CurrentLocationView() {
  const location = useLocation();
  return <div data-testid="current-location">{`${location.pathname}${location.search}`}</div>;
}

export function renderDialogWithLocation(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              {ui}
              <CurrentLocationView />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

export function seedRenameWorkspace() {
  workspaceStore.setState(
    {
      ...workspaceStore.getState(),
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Workspace One",
          title: "Workspace One",
          sourceBranch: "main",
          branch: "feature/original",
          summaryId: "workspace-1",
          worktreePath: "/tmp/worktrees/workspace-1",
        },
      ],
    },
    true,
  );
}

export function setupCreateWorkspaceDialogViewTests() {
  beforeEach(() => {
    workspaceStore.setState(
      {
        ...initialWorkspaceStoreState,
        displayProjectIds: ["repo-1", "repo-2"],
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
          {
            id: "repo-2",
            key: "repo-2",
            name: "Repo Two",
            path: "/tmp/repo-2",
            localPath: "/tmp/repo-2",
            worktreePath: "/tmp/worktrees-2",
            defaultBranch: "develop",
            missing: false,
          },
        ],
      },
      true,
    );

    getMockedCommands().listGitBranches.mockImplementation(
      async ({ workspaceWorktreePath }: { workspaceWorktreePath: string }): Promise<{ branches: string[] }> => {
        if (workspaceWorktreePath === "/tmp/repo-2") {
          return { branches: ["master", "develop", "release/1.0"] };
        }

        return { branches: ["main", "feature/alpha"] };
      },
    );
    getMockedCommands().getGitAuthorName.mockResolvedValue("Alice Chen");
    getMockedCommands().renameWorkspace.mockResolvedValue(undefined);
    getMockedCommands().renameWorkspaceBranch.mockResolvedValue(undefined);
    getMockedCommands().listAgentModels.mockResolvedValue({ models: [] });
    getMockedCommands().listNodesByOrg.mockResolvedValue([
      { id: "daemon-1", name: "Local Node", scope: "private", canUse: true },
      { id: "node-2", name: "Shared Node", scope: "shared", canUse: true },
    ]);
    agentSettingsStore.setState(defaultAgentSettingsState);
    workspaceSettingsStore.setState(
      {
        ...initialWorkspaceSettingsStoreState,
        prefixMode: "none",
        customPrefix: "",
      },
      true,
    );
    sessionStore.setState(initialSessionStoreState, true);
  });

  afterEach(() => {
    workspaceStore.setState(initialWorkspaceStoreState, true);
    workspaceSettingsStore.setState(initialWorkspaceSettingsStoreState, true);
    sessionStore.setState(initialSessionStoreState, true);
    agentSettingsStore.setState(defaultAgentSettingsState);
    cleanup();
    vi.clearAllMocks();
    resetMockedCommands();
  });
}
