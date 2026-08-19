// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSharedTerminalResourceUsageSnapshotForTests } from "../../../../domains/terminal/runtime/sharedTerminalResourceUsage";
import { tabStore } from "../../../../domains/workbench/state/tabStore";
import { workspaceStore } from "../../../../domains/workspace/state/workspaceStore";
import { LeftPaneResourceUsageControl } from "./LeftPaneResourceUsageControl";
import { WorkspaceResourceUsageControl } from "./WorkspaceResourceUsageControl";

const mocked = vi.hoisted(() => ({
  getTerminalResourceUsage: vi.fn(),
  setSelectedRepoId: vi.fn(),
  setSelectedWorkspaceId: vi.fn(),
  selectTab: vi.fn(),
  activateWorkspace: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
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

vi.mock("@renderer/domains/terminal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/terminal")>();
  return {
    ...actual,
    getTerminalResourceUsage: mocked.getTerminalResourceUsage,
  };
});

vi.mock("@renderer/domains/workbench", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/workbench")>();
  return {
    ...actual,
    activateWorkspace: mocked.activateWorkspace,
    setSelectedTab: mocked.selectTab,
  };
});

const initialWorkspaceState = workspaceStore.getState();
const initialTabState = tabStore.getState();

describe("Resource usage shared polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSharedTerminalResourceUsageSnapshotForTests();
    mocked.getTerminalResourceUsage.mockReset();
    mocked.setSelectedRepoId.mockReset();
    mocked.setSelectedWorkspaceId.mockReset();
    mocked.selectTab.mockReset();
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
