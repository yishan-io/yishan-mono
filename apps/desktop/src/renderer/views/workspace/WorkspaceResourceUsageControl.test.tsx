// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tabStore } from "../../store/tabStore";
import { workspaceStore } from "../../store/workspaceStore";
import { WorkspaceResourceUsageControl } from "./WorkspaceResourceUsageControl";

const mocked = vi.hoisted(() => ({
  getTerminalResourceUsage: vi.fn(),
  setSelectedWorkspaceId: vi.fn(),
  setSelectedTabId: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === "terminal.resourceUsage.summary") {
        return `CPU: ${values?.cpu ?? ""} · MEM: ${values?.memory ?? ""}`;
      }
      return key;
    },
  }),
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => ({
    getTerminalResourceUsage: mocked.getTerminalResourceUsage,
    setSelectedWorkspaceId: mocked.setSelectedWorkspaceId,
    setSelectedTabId: mocked.setSelectedTabId,
  }),
}));

const initialWorkspaceState = workspaceStore.getState();
const initialTabState = tabStore.getState();

describe("WorkspaceResourceUsageControl", () => {
  beforeEach(() => {
    mocked.getTerminalResourceUsage.mockReset();
    mocked.setSelectedWorkspaceId.mockReset();
    mocked.setSelectedTabId.mockReset();
    mocked.getTerminalResourceUsage.mockResolvedValue({
      totalCpuPercent: 20,
      totalMemoryBytes: 200 * 1024 * 1024,
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
          sessionId: "terminal-session-1",
          workspaceId: "workspace-1",
          pid: 6511,
          processName: "python",
          cpuPercent: 4,
          memoryBytes: 64 * 1024 * 1024,
        },
        {
          sessionId: "terminal-session-2",
          workspaceId: "workspace-2",
          pid: 8000,
          processName: "node",
          cpuPercent: 10,
          memoryBytes: 72 * 1024 * 1024,
        },
      ],
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
      ],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-1",
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
      selectedWorkspaceId: "workspace-1",
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

  it("shows workspace CPU/memory summary and subprocess rows", async () => {
    render(<WorkspaceResourceUsageControl />);

    await waitFor(() => {
      expect(screen.getByText("CPU: 10.0% · MEM: 128 MB")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "terminal.resourceUsage.toggleLabel" }));
    expect(screen.getByText("node")).toBeTruthy();
    expect(screen.getByText("python")).toBeTruthy();
    expect(screen.queryByText("8000")).toBeNull();
  });

  it("jumps to the matching terminal tab when one process row is clicked", async () => {
    render(<WorkspaceResourceUsageControl />);

    await waitFor(() => {
      expect(screen.getByText("CPU: 10.0% · MEM: 128 MB")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "terminal.resourceUsage.toggleLabel" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /node.*6510.*6.0%.*64 MB/ }));

    expect(mocked.setSelectedWorkspaceId).toHaveBeenCalledWith("workspace-1");
    expect(mocked.setSelectedTabId).toHaveBeenCalledWith("terminal-tab-1");
  });

  it("skips usage polling when selected workspace has no terminal tabs", async () => {
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
      selectedWorkspaceId: "workspace-1",
      selectedTabId: "session-tab-1",
      selectedTabIdByWorkspaceId: {
        "workspace-1": "session-tab-1",
      },
    });

    render(<WorkspaceResourceUsageControl />);

    await waitFor(() => {
      expect(mocked.getTerminalResourceUsage).not.toHaveBeenCalled();
    });
  });

  it("skips usage polling when terminal tabs are not bound to session ids", async () => {
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
            sessionId: "",
          },
        },
      ],
      selectedWorkspaceId: "workspace-1",
      selectedTabId: "terminal-tab-1",
      selectedTabIdByWorkspaceId: {
        "workspace-1": "terminal-tab-1",
      },
    });

    render(<WorkspaceResourceUsageControl />);

    await waitFor(() => {
      expect(mocked.getTerminalResourceUsage).not.toHaveBeenCalled();
    });
    expect(screen.queryByRole("button", { name: "terminal.resourceUsage.toggleLabel" })).toBeNull();
  });

  it("releases polling lock after refresh timeout when request hangs", async () => {
    vi.useFakeTimers();
    try {
      mocked.getTerminalResourceUsage.mockImplementation(() => new Promise(() => {}));

      render(<WorkspaceResourceUsageControl />);

      await Promise.resolve();
      expect(mocked.getTerminalResourceUsage).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(9_000);
      expect(mocked.getTerminalResourceUsage).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(6_000);
      expect(mocked.getTerminalResourceUsage).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(15_000);
      expect(mocked.getTerminalResourceUsage).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
