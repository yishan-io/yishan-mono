// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/features/workbench";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "../../../../features/project/state/projectStore";
import { tabStore } from "../../../../features/workbench/state/tabStore";
import { workspaceStore } from "../../../../features/workspace/state/workspaceStore";
import { LeftPaneResourceUsageControl } from "./LeftPaneResourceUsageControl";

const mocked = vi.hoisted(() => ({
  getTerminalResourceUsage: vi.fn(),
  activateWorkspace: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === "terminal.resourceUsage.leftPaneSummary") {
        return `MEM: ${values?.memory ?? ""}`;
      }
      if (key === "terminal.resourceUsage.columns.repo") {
        return "Repo";
      }
      if (key === "workspace.column") {
        return "Workspace";
      }
      if (key === "terminal.resourceUsage.columns.cpu") {
        return "CPU";
      }
      if (key === "terminal.resourceUsage.columns.memory") {
        return "Memory";
      }
      return key;
    },
  }),
}));

vi.mock("../../../../app/commands/useCommands", () => {
  const commandSurface = () => ({
    getTerminalResourceUsage: mocked.getTerminalResourceUsage,
    activateWorkspace: mocked.activateWorkspace,
  });
  return {
    useAppCommands: commandSurface,
    useSessionCommands: commandSurface,
    useWorkspaceCommands: commandSurface,
    useAgentCommands: commandSurface,
    useGitCommands: commandSurface,
    useNodeCommands: commandSurface,
    useNotificationCommands: commandSurface,
    useOrganizationCommands: commandSurface,
    useOverviewCommands: commandSurface,
    useScheduledJobCommands: commandSurface,
    useFileCommands: commandSurface,
    useProjectCommands: commandSurface,
    useWorkbenchCommands: commandSurface,
    useTerminalCommands: commandSurface,
    useSettingsCommands: commandSurface,
  };
});

const initialWorkspaceState = workspaceStore.getState();
const initialTabState = tabStore.getState();

/** Renders one router harness that can trigger pathname changes while keeping the control mounted. */
function RouteNavigationHarness() {
  const navigate = useNavigate();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          navigate("/settings");
        }}
      >
        go-settings
      </button>
      <LeftPaneResourceUsageControl />
    </>
  );
}

describe("LeftPaneResourceUsageControl", () => {
  beforeEach(() => {
    mocked.getTerminalResourceUsage.mockReset();
    mocked.activateWorkspace.mockReset();
    mocked.getTerminalResourceUsage.mockResolvedValue({
      totalCpuPercent: 20,
      totalMemoryBytes: 320 * 1024 * 1024,
      collectedAt: Date.now(),
      processes: [
        {
          sessionId: "terminal-session-1",
          workspaceId: "workspace-1",
          pid: 6510,
          processName: "node",
          cpuPercent: 6,
          memoryBytes: 64 * 1024 * 1024,
        },
        {
          sessionId: "terminal-session-2",
          workspaceId: "workspace-2",
          pid: 7001,
          processName: "python",
          cpuPercent: 10,
          memoryBytes: 224 * 1024 * 1024,
        },
        {
          sessionId: "terminal-session-3",
          workspaceId: "workspace-1",
          pid: 8000,
          processName: "bash",
          cpuPercent: 2,
          memoryBytes: 32 * 1024 * 1024,
        },
      ],
    });

    workbenchNavigationStore.setState({
      activeProjectId: "repo-1",
      activeWorkspaceId: "workspace-1",
    });
    workspaceStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "repo-1",
          name: "Repo 1",
          path: "/tmp/repo-1",
          missing: false,
          worktreePath: "/tmp/repo-1",
        },
        {
          id: "repo-2",
          key: "repo-2",
          name: "Repo 2",
          path: "/tmp/repo-2",
          missing: false,
          worktreePath: "/tmp/repo-2",
        },
      ],
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
        {
          id: "workspace-2",
          repoId: "repo-2",
          name: "Workspace 2",
          title: "Workspace 2",
          sourceBranch: "main",
          branch: "main",
          summaryId: "workspace-2",
          worktreePath: "/tmp/repo-2/workspace-2",
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
          worktreePath: "/tmp/repo-1",
        },
        {
          id: "repo-2",
          key: "repo-2",
          name: "Repo 2",
          path: "/tmp/repo-2",
          missing: false,
          worktreePath: "/tmp/repo-2",
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
    workspaceStore.setState(initialWorkspaceState, true);
    tabStore.setState(initialTabState, true);
    vi.clearAllMocks();
  });

  it("shows total memory summary and rows split by repo and workspace columns", async () => {
    render(<LeftPaneResourceUsageControl />);

    await waitFor(() => {
      expect(screen.getByText("MEM: 320 MB")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "terminal.resourceUsage.toggleLabel" }));

    expect(screen.getByText("Repo")).toBeTruthy();
    expect(screen.getByText("Workspace")).toBeTruthy();
    expect(screen.getByText("CPU")).toBeTruthy();
    expect(screen.getByText("Memory")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Repo 1.*Workspace 1.*8.0%.*96 MB/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Repo 2.*Workspace 2.*10.0%.*224 MB/ })).toBeTruthy();
  });

  it("jumps to the clicked workspace row", async () => {
    render(<LeftPaneResourceUsageControl />);

    await waitFor(() => {
      expect(screen.getByText("MEM: 320 MB")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "terminal.resourceUsage.toggleLabel" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Workspace 2/ }));

    expect(mocked.activateWorkspace).toHaveBeenCalledWith({ workspaceId: "workspace-2" });
  });

  it("does not poll or render when there are no terminal sessions", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "session-tab-1",
          workspaceId: "workspace-1",
          title: "Chat",
          pinned: false,
          kind: "session",
          data: {
            sessionId: "chat-session-1",
            agentKind: "opencode",
            isInitializing: false,
          },
        },
      ],
      selectedTabId: "session-tab-1",
      selectedTabIdByWorkspaceId: {
        "workspace-1": "session-tab-1",
      },
    });

    const { container } = render(<LeftPaneResourceUsageControl />);

    await waitFor(() => {
      expect(mocked.getTerminalResourceUsage).not.toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });

  it("closes the dropdown when router path changes away from workspace root", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <RouteNavigationHarness />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("MEM: 320 MB")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "terminal.resourceUsage.toggleLabel" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "go-settings", hidden: true }));
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });
});
