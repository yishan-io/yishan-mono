// @vitest-environment jsdom

import { agentChatStore } from "@renderer/domains/agent/state/agentChatStore";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainPaneView } from "./MainPaneView";

const mocked = vi.hoisted(() => ({
  renderWorkspaceSplitPane: vi.fn(),
}));

const workspace = {
  id: "workspace-1",
  state: "active",
  worktreePath: "/tmp/workspace-1",
};

const AGENT_CHAT_TAB = {
  id: "tab-1",
  workspaceId: workspace.id,
  title: "Agent chat",
  pinned: false,
  kind: "agent-chat" as const,
  data: { cwd: workspace.worktreePath, sessionId: "session-1", sessionView: "full" as const },
};

const tabs = [AGENT_CHAT_TAB];

vi.mock("@renderer/domains/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/agent")>();
  return {
    ...actual,
    WorkspaceAgentChatSurface: () => null,
  };
});

vi.mock("@renderer/domains/browser", () => ({
  removeWebviewsForClosedTabs: vi.fn(),
}));

vi.mock("@renderer/domains/files", () => ({
  FileSearchOverlay: () => null,
  createNewWhiteboard: vi.fn(),
  getFileTreeIcon: vi.fn(),
  markFileTabSaved: vi.fn(),
  openEntryInExternalApp: vi.fn(),
  readFile: vi.fn(),
  refreshFileTabFromDisk: vi.fn(),
  renameEntry: vi.fn(),
  updateFileTabContent: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@renderer/domains/git", () => ({
  readBranchComparisonDiff: vi.fn(),
  readCommitDiff: vi.fn(),
  readDiff: vi.fn(),
  refreshDiffTabContent: vi.fn(),
}));

vi.mock("@renderer/domains/project", () => ({
  projectStore: (selector: (state: { lastUsedExternalAppId: null }) => unknown) =>
    selector({ lastUsedExternalAppId: null }),
  supportsGitFeatures: () => false,
}));

vi.mock("@renderer/domains/terminal", () => ({
  disposeTerminalRuntimesForClosedTabs: vi.fn(),
  forceFitTerminalRuntimes: vi.fn(),
  retainOpenTerminalTabFocus: vi.fn(),
}));

vi.mock("@renderer/domains/workbench", () => ({
  WorkspaceSplitPane: (props: { agentChatTabIsRunningByTabId: Record<string, boolean> }) => {
    mocked.renderWorkspaceSplitPane(props.agentChatTabIsRunningByTabId);
    return null;
  },
  TabPanel: () => null,
  openTabWithContentSeed: vi.fn(),
  retainOpenTabFocus: vi.fn(),
  tabStore: (selector: (state: { tabs: typeof tabs; selectedTabId: string }) => unknown) =>
    selector({ tabs, selectedTabId: AGENT_CHAT_TAB.id }),
  workbenchNavigationStore: (selector: (state: { activeWorkspaceId: string }) => unknown) =>
    selector({ activeWorkspaceId: workspace.id }),
}));

vi.mock("@renderer/domains/workspace", () => ({
  isFolderWorkspace: () => false,
  workspaceStore: (selector: (state: { workspaces: (typeof workspace)[] }) => unknown) =>
    selector({ workspaces: [workspace] }),
  WorkspaceErrorStateView: () => null,
}));

vi.mock("@renderer/ui/theme", () => ({
  DARK_SURFACE_COLORS: { mainPane: "" },
}));

vi.mock("../../selectors", () => ({
  useSelectedWorkspaceWithProject: () => ({ selectedProject: null }),
}));

vi.mock("../launch/LaunchView", () => ({ LaunchView: () => null }));
vi.mock("../tab-content/useTabContentRenderer", () => ({ useTabContentRenderer: () => () => null }));
vi.mock("../title-bar/MainPaneTitleBarView", () => ({ MainPaneTitleBarView: () => null }));
vi.mock("./MainPaneRightArea", () => ({ MainPaneRightArea: () => null }));
vi.mock("../../commands/tabCloseHandler", () => ({
  closeAllTabsWithCleanup: vi.fn(),
  closeOtherTabsWithCleanup: vi.fn(),
  closeTabWithCleanup: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  agentChatStore.setState({ sessionsByTabId: {} });
});

describe("MainPaneView agent chat running-state projection", () => {
  it("ignores streaming content updates but propagates running-state changes", () => {
    agentChatStore.getState().initSession(AGENT_CHAT_TAB.id, "session-1");
    render(<MainPaneView />);

    expect(mocked.renderWorkspaceSplitPane).toHaveBeenCalledTimes(1);
    expect(mocked.renderWorkspaceSplitPane).toHaveBeenLastCalledWith({ "tab-1": false });

    act(() => {
      agentChatStore.getState().updateStreamingMessage(AGENT_CHAT_TAB.id, {
        id: "streaming-message-1",
        role: "assistant",
        content: [{ type: "text", text: "streaming" }],
      });
    });

    expect(mocked.renderWorkspaceSplitPane).toHaveBeenCalledTimes(1);

    act(() => {
      agentChatStore.getState().setSessionState(AGENT_CHAT_TAB.id, "running");
    });

    expect(mocked.renderWorkspaceSplitPane).toHaveBeenCalledTimes(2);
    expect(mocked.renderWorkspaceSplitPane).toHaveBeenLastCalledWith({ "tab-1": true });
  });
});
