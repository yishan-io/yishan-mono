// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSharedTerminalResourceUsageSnapshotForTests } from "../../hooks/useSharedTerminalResourceUsageSnapshot";
import { tabStore } from "../../store/tabStore";
import { workspaceStore } from "../../store/workspaceStore";
import { LeftPaneResourceUsageControl } from "./LeftPane/LeftPaneResourceUsageControl";
import { WorkspaceResourceUsageControl } from "./WorkspaceResourceUsageControl";

const mocked = vi.hoisted(() => ({
  getTerminalResourceUsage: vi.fn(),
  setSelectedRepoId: vi.fn(),
  setSelectedWorkspaceId: vi.fn(),
  setSelectedTabId: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === "terminal.resourceUsage.summary") {
        return `CPU: ${values?.cpu ?? ""} · MEM: ${values?.memory ?? ""}`;
      }
      if (key === "terminal.resourceUsage.leftPaneSummary") {
        return `MEM: ${values?.memory ?? ""}`;
      }
      return key;
    },
  }),
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => ({
    getTerminalResourceUsage: mocked.getTerminalResourceUsage,
    setSelectedRepoId: mocked.setSelectedRepoId,
    setSelectedWorkspaceId: mocked.setSelectedWorkspaceId,
    setSelectedTabId: mocked.setSelectedTabId,
  }),
}));

const initialWorkspaceState = workspaceStore.getState();
const initialTabState = tabStore.getState();

describe("Resource usage shared polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSharedTerminalResourceUsageSnapshotForTests();
    mocked.getTerminalResourceUsage.mockReset();
    mocked.setSelectedRepoId.mockReset();
    mocked.setSelectedWorkspaceId.mockReset();
    mocked.setSelectedTabId.mockReset();
    mocked.getTerminalResourceUsage.mockResolvedValue({
      totalCpuPercent: 12,
      totalMemoryBytes: 96 * 1024 * 1024,
      collectedAt: Date.now(),
      processes: [
        {
          sessionId: "terminal-session-1",
          workspaceId: "workspace-1",
          pid: 6510,
          processName: "node",
          cpuPercent: 12,
          memoryBytes: 96 * 1024 * 1024,
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
    resetSharedTerminalResourceUsageSnapshotForTests();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("polls once per interval when both controls are mounted", async () => {
    render(
      <>
        <WorkspaceResourceUsageControl />
        <LeftPaneResourceUsageControl />
      </>,
    );

    await Promise.resolve();
    expect(mocked.getTerminalResourceUsage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(mocked.getTerminalResourceUsage).toHaveBeenCalledTimes(2);
  });
});
