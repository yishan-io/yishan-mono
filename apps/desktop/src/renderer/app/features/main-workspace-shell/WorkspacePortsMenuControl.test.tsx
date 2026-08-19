// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { WorkspacePortsMenuControl } from "./WorkspacePortsMenuControl";

const mocked = vi.hoisted(() => ({
  killTerminalProcess: vi.fn(),
  listDetectedPorts: vi.fn(),
  setSelectedWorkspaceId: vi.fn(),
  selectTab: vi.fn(),
  subscribeDetectedPorts: vi.fn(() => () => {}),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../app/commands/useCommands", () => {
  const commandSurface = () => ({
    killTerminalProcess: mocked.killTerminalProcess,
    listDetectedPorts: mocked.listDetectedPorts,
    setSelectedWorkspaceId: mocked.setSelectedWorkspaceId,
    selectTab: mocked.selectTab,
    subscribeDetectedPorts: mocked.subscribeDetectedPorts,
  });
  return {
    useAppCommands: commandSurface,
    useWorkspaceCommands: commandSurface,
    useAgentCommands: commandSurface,
    useGitCommands: commandSurface,
    useFileCommands: commandSurface,
    useWorkbenchCommands: commandSurface,
    useTerminalCommands: commandSurface,
  };
});

let navigateToSettings: (() => void) | null = null;

/** Renders the same workspace shell across child routes so settings behaves like an overlay. */
function WorkspaceShell() {
  const navigate = useNavigate();
  navigateToSettings = () => {
    navigate("/settings");
  };

  return (
    <>
      <WorkspacePortsMenuControl />
      <Outlet />
    </>
  );
}

/** Mounts the workspace shell with index and settings routes used for menu-close regression coverage. */
function renderWorkspaceShell() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<WorkspaceShell />}>
          <Route index element={null} />
          <Route path="settings" element={<div data-testid="settings-overlay">settings-overlay</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const initialWorkspaceState = workspaceStore.getState();
const initialTabState = tabStore.getState();

describe("WorkspacePortsMenuControl", () => {
  beforeEach(() => {
    mocked.listDetectedPorts.mockReset();
    mocked.killTerminalProcess.mockReset();
    mocked.setSelectedWorkspaceId.mockReset();
    mocked.selectTab.mockReset();

    mocked.listDetectedPorts.mockResolvedValue([
      {
        sessionId: "terminal-session-1",
        workspaceId: "workspace-1",
        port: 3000,
        pid: 6510,
        processName: "node",
        address: "0.0.0.0",
      },
    ]);

    workbenchNavigationStore.setState({
      activeProjectId: "repo-1",
      activeWorkspaceId: "workspace-1",
    });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          name: "Workspace 1",
          title: "Workspace 1",
          sourceBranch: "main",
          branch: "main",
          summaryId: "workspace-1",
          worktreePath: "/tmp/repo-1/workspace-1",
        },
      ],
    });

    tabStore.setState({
      tabs: [
        {
          id: "terminal-tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: {
            title: "Terminal",
            paneId: "pane-1",
            sessionId: "terminal-session-1",
          },
        },
      ],
      selectedTabId: "terminal-tab-1",
      selectedTabIdByWorkspaceId: {
        "workspace-1": "terminal-tab-1",
      },
    });
  });

  afterEach(() => {
    cleanup();
    navigateToSettings = null;
    workspaceStore.setState(initialWorkspaceState, true);
    tabStore.setState(initialTabState, true);
    vi.clearAllMocks();
  });

  it("closes the ports dropdown when the settings route opens", async () => {
    renderWorkspaceShell();

    fireEvent.click(await screen.findByRole("button", { name: "terminal.ports.toggleLabel" }));
    expect(await screen.findByText("3000")).toBeTruthy();

    if (!navigateToSettings) {
      throw new Error("Expected settings navigation helper to be initialized.");
    }
    navigateToSettings();

    await waitFor(() => {
      expect(screen.getByTestId("settings-overlay")).toBeTruthy();
      expect(screen.queryByText("3000")).toBeNull();
    });
  });

  it("kills pid when close port action is clicked", async () => {
    mocked.killTerminalProcess.mockResolvedValue({ ok: true });
    renderWorkspaceShell();

    fireEvent.click(await screen.findByRole("button", { name: "terminal.ports.toggleLabel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close port 3000" }));

    await waitFor(() => {
      expect(mocked.killTerminalProcess).toHaveBeenCalledWith({ pid: 6510 });
    });
  });
});
