// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspacePaneVisibilityProvider } from "../../hooks/useWorkspacePaneVisibility";
import { AGENT_SETTINGS_STORE_STORAGE_KEY, agentSettingsStore } from "../../store/settings/agentSettingsStore";
import { MainPaneView } from "./MainPaneView";

const mocked = vi.hoisted(() => {
  const stateRef: { current: Record<string, unknown> } = {
    current: {},
  };

  const workspaceStore = vi.fn((selector: (state: Record<string, unknown>) => unknown) => selector(stateRef.current));

  return {
    stateRef,
    workspaceStore,
    getMainWindowFullscreenState: vi.fn(async () => ({ isFullscreen: false })),
    getTerminalResourceUsage: vi.fn().mockResolvedValue({
      totalCpuPercent: 0,
      totalMemoryBytes: 0,
      collectedAt: 0,
      processes: [],
    }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../store/workspaceStore", () => ({
  workspaceStore: mocked.workspaceStore,
}));

vi.mock("../../store/tabStore", () => ({
  tabStore: mocked.workspaceStore,
}));

vi.mock("../../store/chatStore", () => ({
  chatStore: (
    selector: (state: {
      workspaceUnreadToneByWorkspaceId: Record<string, "success" | "error">;
      workspaceAgentStatusByWorkspaceId: Record<string, "running" | "waiting_input" | "idle">;
    }) => unknown,
  ) =>
    selector({
      workspaceUnreadToneByWorkspaceId:
        (mocked.stateRef.current.workspaceUnreadToneByWorkspaceId as Record<string, "success" | "error"> | undefined) ?? {},
      workspaceAgentStatusByWorkspaceId:
        (mocked.stateRef.current.workspaceAgentStatusByWorkspaceId as
          | Record<string, "running" | "waiting_input" | "idle">
          | undefined) ?? {},
    }),
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => {
    const state = mocked.stateRef.current as Record<string, unknown>;
    return {
      listDetectedPorts: state.listDetectedPorts,
      getTerminalResourceUsage: state.getTerminalResourceUsage ?? mocked.getTerminalResourceUsage,
      setSelectedRepoId: state.setSelectedRepoId,
      setSelectedWorkspaceId: state.setSelectedWorkspaceId,
      selectTab: state.selectTab,
      createTab: state.createTab,
      openTab: state.openTab,
      closeTab: state.closeTab,
      closeOtherTabs: state.closeOtherTabs,
      closeAllTabs: state.closeAllTabs,
      toggleTabPinned: state.toggleTabPinned,
      reorderTab: state.reorderTab,
      renameTab: state.renameTab,
      readFile: state.readFile,
      readDiff: state.readDiff,
      readCommitDiff: state.readCommitDiff,
      readBranchComparisonDiff: state.readBranchComparisonDiff,
      refreshFileTabFromDisk: state.refreshFileTabFromDisk,
      refreshDiffTabContent: state.refreshDiffTabContent,
      updateFileTabContent: state.updateFileTabContent,
      markFileTabSaved: state.markFileTabSaved,
    };
  },
}));

vi.mock("../../helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../commands/appCommands", () => ({
  getMainWindowFullscreenState: () => mocked.getMainWindowFullscreenState(),
}));

vi.mock("../../commands/fileCommands", () => ({
  writeFile: vi.fn(),
}));

vi.mock("../../components/FileDiffViewer", () => ({
  FileDiffViewer: () => <div data-testid="repo-diff-viewer" />,
}));

vi.mock("../../components/fileTreeIcons", () => ({
  getFileTreeIcon: () => "",
}));

vi.mock("../../components/TabBar", () => ({
  TabBar: ({
    tabs,
    onCreateTab,
    enabledAgentKinds,
  }: {
    tabs: Array<{ id: string; title: string }>;
    onCreateTab: (
      option: "terminal" | "opencode" | "codex" | "claude" | "gemini" | "pi" | "copilot" | "cursor",
    ) => void;
    enabledAgentKinds?: Array<"opencode" | "codex" | "claude" | "gemini" | "pi" | "copilot" | "cursor">;
  }) => (
    <div>
      <div data-testid="tab-bar">{tabs.map((tab) => tab.title).join(",")}</div>
      {enabledAgentKinds?.includes("codex") ? (
        <button type="button" onClick={() => onCreateTab("codex")}>
          create-codex
        </button>
      ) : null}
      <button type="button" onClick={() => onCreateTab("terminal")}>
        create-terminal
      </button>
    </div>
  ),
}));

vi.mock("../../components/SplitPaneGroup", () => ({
  SplitPaneGroup: ({
    pane,
    tabs,
    renderContent,
    onCreateTab,
    enabledAgentKinds,
  }: {
    pane: { id: string; tabIds: string[]; selectedTabId: string };
    tabs: Array<{ id: string; title: string }>;
    renderContent: (pane: { id: string; tabIds: string[]; selectedTabId: string }, _extra: unknown) => React.ReactNode;
    onCreateTab: (option: string) => void;
    enabledAgentKinds?: string[];
  }) => (
    <div data-testid={`editor-pane-${pane.id}`}>
      <div data-testid="tab-bar">{tabs.map((tab) => tab.title).join(",")}</div>
      {enabledAgentKinds?.includes("codex") ? (
        <button type="button" onClick={() => onCreateTab("codex")}>
          create-codex
        </button>
      ) : null}
      <button type="button" onClick={() => onCreateTab("terminal")}>
        create-terminal
      </button>
      <div data-testid="pane-content">{renderContent(pane, null)}</div>
    </div>
  ),
}));

vi.mock("../../components/SplitPaneContainer", () => ({
  SplitPaneContainer: ({
    node,
    renderPane,
  }: {
    node: { kind: string; id: string; tabIds?: string[]; selectedTabId?: string };
    renderPane: (pane: { id: string; tabIds: string[]; selectedTabId: string }) => React.ReactNode;
  }) => {
    // For a leaf, render the pane directly
    if (node.kind === "leaf") {
      return <div data-testid="split-container">{renderPane(node as any)}</div>;
    }
    // For a branch, render both children
    return <div data-testid="split-container">split-branch</div>;
  },
}));

vi.mock("../../components/SplitDropZone", () => ({
  SplitDropZone: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  resolveDropResult: () => null,
}));

vi.mock("../../store/splitPaneStore", () => {
  // Builds a root pane for a given workspace from the current test state.
  function buildRootPaneForWorkspace(workspaceId: string) {
    const state = mocked.stateRef.current as Record<string, unknown>;
    const tabs = (state.tabs ?? []) as Array<{ id: string; workspaceId: string }>;
    const selectedTabId = (state.selectedTabId ?? "") as string;
    const workspaceTabIds = tabs
      .filter((tab) => tab.workspaceId === workspaceId)
      .map((tab) => tab.id);
    return {
      kind: "leaf" as const,
      id: "root-pane",
      tabIds: workspaceTabIds,
      selectedTabId: workspaceTabIds.includes(selectedTabId) ? selectedTabId : (workspaceTabIds[0] ?? ""),
    };
  }

  function buildLayoutByWorkspaceId() {
    const state = mocked.stateRef.current as Record<string, unknown>;
    const tabs = (state.tabs ?? []) as Array<{ id: string; workspaceId: string }>;
    const workspaceIds = new Set(tabs.map((tab) => tab.workspaceId));
    const result: Record<string, { root: any; activePaneId: string }> = {};
    for (const wsId of workspaceIds) {
      result[wsId] = { root: buildRootPaneForWorkspace(wsId), activePaneId: "root-pane" };
    }
    return result;
  }

  return {
    splitPaneStore: Object.assign(
      (selector: (state: any) => any) => {
        return selector({ layoutByWorkspaceId: buildLayoutByWorkspaceId() });
      },
      {
        getState: () => {
          const selectedWorkspaceId = (mocked.stateRef.current as Record<string, unknown>).selectedWorkspaceId as string ?? "";
          const rootPane = buildRootPaneForWorkspace(selectedWorkspaceId);
          return {
            layoutByWorkspaceId: buildLayoutByWorkspaceId(),
            getLayout: (wsId: string) => ({ root: buildRootPaneForWorkspace(wsId), activePaneId: "root-pane" }),
            getActivePane: () => rootPane,
            getPane: () => rootPane,
            getPaneForTab: (_wsId: string, tabId: string) => (rootPane.tabIds.includes(tabId) ? rootPane : null),
            getAllPanes: () => [rootPane],
            setActivePane: vi.fn(),
            selectTab: vi.fn(),
            registerTabInPane: vi.fn(),
            unregisterTabFromPane: vi.fn(),
            splitPane: vi.fn(),
            moveTab: vi.fn(),
            reorderTab: vi.fn(),
            updateSplitRatio: vi.fn(),
          };
        },
        setState: vi.fn(),
        subscribe: vi.fn(() => vi.fn()),
      },
    ),
  };
});

vi.mock("../../components/FileEditor", () => ({
  FileEditor: ({ isDeleted }: { isDeleted?: boolean }) => (
    <div data-testid="file-editor-view" data-is-deleted={isDeleted ? "true" : "false"} />
  ),
}));

vi.mock("../../components/UnsupportedFileView", () => ({
  UnsupportedFileView: ({ path, hint }: { path: string; hint?: string }) => (
    <div data-testid="unsupported-file-view" data-hint={hint ?? ""}>
      {path}
    </div>
  ),
}));

vi.mock("./LaunchView", () => ({
  LaunchView: () => <div data-testid="launch-view" />,
}));

vi.mock("./terminal/TerminalView", () => ({
  TerminalView: ({ tabId, focusRequestKey = 0 }: { tabId: string; focusRequestKey?: number }) => (
    <div data-testid="terminal-view" data-tab-id={tabId} data-focus-request-key={focusRequestKey} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.removeItem(AGENT_SETTINGS_STORE_STORAGE_KEY);
  agentSettingsStore.setState({
    inUseByAgentKind: {
      opencode: true,
      codex: true,
      claude: true,
      gemini: true,
      pi: true,
      copilot: true,
      cursor: true,
    },
  });
});

function buildStoreState(isInitializing: boolean) {
  return {
    projects: [
      {
        id: "repo-1",
        name: "Repo 1",
        path: "/tmp/repo-1",
      },
    ],
    selectedProjectId: "repo-1",
    workspaces: [
      {
        id: "workspace-1",
        repoId: "repo-1",
        branch: "origin/main",
        title: "Workspace 1",
        name: "Workspace 1",
      },
    ],
    selectedWorkspaceId: "workspace-1",
    tabs: [
      {
        id: "tab-1",
        workspaceId: "workspace-1",
        title: "Chat A",
        pinned: false,
        kind: "session",
        data: {
          sessionId: isInitializing ? "" : "session-1",
          isInitializing,
          agentKind: "opencode",
        },
      },
    ],
    selectedTabId: "tab-1",
    listDetectedPorts: vi.fn().mockResolvedValue([]),
    setSelectedRepoId: vi.fn(),
    setSelectedWorkspaceId: vi.fn(),
    selectTab: vi.fn(),
    createTab: vi.fn(),
    openTab: vi.fn(),
    closeTab: vi.fn(),
    closeOtherTabs: vi.fn(),
    closeAllTabs: vi.fn(),
    toggleTabPinned: vi.fn(),
    reorderTab: vi.fn(),
    renameTab: vi.fn(),
    readFile: vi.fn(),
    readDiff: vi.fn(),
    readCommitDiff: vi.fn(),
    readBranchComparisonDiff: vi.fn(),
    refreshFileTabFromDisk: vi.fn(),
    refreshDiffTabContent: vi.fn(),
    updateFileTabContent: vi.fn(),
    markFileTabSaved: vi.fn(),
    workspaceUnreadToneByWorkspaceId: {},
  };
}

describe("MainPaneView", () => {
  it("shows chat-disabled placeholder for session tabs", () => {
    mocked.stateRef.current = buildStoreState(true);

    render(<MainPaneView />);

    expect(screen.getByTestId("tab-bar").textContent).toContain("Chat A");
    expect(screen.getByText("Chat is currently disabled.")).toBeTruthy();
  });

  it("renders unsupported file view for unsupported file tabs", () => {
    mocked.stateRef.current = {
      ...buildStoreState(false),
      tabs: [
        {
          id: "tab-unsupported-1",
          workspaceId: "workspace-1",
          title: "main.sqlite",
          pinned: false,
          kind: "file",
          data: {
            path: "data/main.sqlite",
            content: "",
            savedContent: "",
            isDirty: false,
            isTemporary: false,
            isUnsupported: true,
          },
        },
      ],
      selectedTabId: "tab-unsupported-1",
    };

    render(<MainPaneView />);

    expect(screen.getByTestId("unsupported-file-view").textContent).toContain("data/main.sqlite");
    expect(screen.queryByTestId("file-editor-view")).toBeNull();
  });

  it("renders large-file unsupported hint for large file tabs", () => {
    mocked.stateRef.current = {
      ...buildStoreState(false),
      tabs: [
        {
          id: "tab-large-1",
          workspaceId: "workspace-1",
          title: "big.log",
          pinned: false,
          kind: "file",
          data: {
            path: "logs/big.log",
            content: "",
            savedContent: "",
            isDirty: false,
            isTemporary: false,
            isUnsupported: true,
            unsupportedReason: "size",
          },
        },
      ],
      selectedTabId: "tab-large-1",
    };

    render(<MainPaneView />);

    expect(screen.getByTestId("unsupported-file-view").getAttribute("data-hint")).toBe("files.unsupported.hintLarge");
  });

  it("passes terminal tab id to terminal view", () => {
    mocked.stateRef.current = {
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          branch: "origin/main",
          title: "Workspace 1",
          name: "Workspace 1",
          worktreePath: "/tmp/workspace-1",
        },
      ],
      projects: [{ id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" }],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-1",
      tabs: [
        {
          id: "terminal-tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: {
            title: "Terminal",
          },
        },
      ],
      selectedTabId: "terminal-tab-1",
      listDetectedPorts: vi.fn().mockResolvedValue([]),
      setSelectedRepoId: vi.fn(),
      setSelectedWorkspaceId: vi.fn(),
      selectTab: vi.fn(),
      createTab: vi.fn(),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      toggleTabPinned: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      readFile: vi.fn(),
      readDiff: vi.fn(),
      readCommitDiff: vi.fn(),
      readBranchComparisonDiff: vi.fn(),
      refreshFileTabFromDisk: vi.fn(),
      refreshDiffTabContent: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
    };

    render(<MainPaneView />);

    const terminalView = screen.getByTestId("terminal-view");
    expect(terminalView.getAttribute("data-tab-id")).toBe("terminal-tab-1");
  });

  it("scopes terminal views to the selected workspace pane", () => {
    mocked.stateRef.current = {
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          branch: "origin/main",
          title: "Workspace 1",
          name: "Workspace 1",
          worktreePath: "/tmp/workspace-1",
        },
        {
          id: "workspace-2",
          repoId: "repo-1",
          branch: "feature/b",
          title: "Workspace 2",
          name: "Workspace 2",
          worktreePath: "/tmp/workspace-2",
        },
      ],
      projects: [{ id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" }],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-1",
      tabs: [
        {
          id: "terminal-tab-1",
          workspaceId: "workspace-1",
          title: "Terminal A",
          pinned: false,
          kind: "terminal",
          data: {
            title: "Terminal A",
          },
        },
        {
          id: "terminal-tab-2",
          workspaceId: "workspace-2",
          title: "Terminal B",
          pinned: false,
          kind: "terminal",
          data: {
            title: "Terminal B",
          },
        },
      ],
      selectedTabId: "terminal-tab-1",
      listDetectedPorts: vi.fn().mockResolvedValue([]),
      setSelectedRepoId: vi.fn(),
      setSelectedWorkspaceId: vi.fn(),
      selectTab: vi.fn(),
      createTab: vi.fn(),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      toggleTabPinned: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      readFile: vi.fn(),
      readDiff: vi.fn(),
      readCommitDiff: vi.fn(),
      readBranchComparisonDiff: vi.fn(),
      refreshFileTabFromDisk: vi.fn(),
      refreshDiffTabContent: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
    };

    render(<MainPaneView />);

    // Both workspaces are mounted (hide-not-unmount) but only workspace-1 is visible
    const tabBars = screen.getAllByTestId("tab-bar");
    const visibleTabBar = tabBars.find((el) => el.textContent?.includes("Terminal A"));
    expect(visibleTabBar).toBeTruthy();
    // Both terminal views stay mounted to preserve state
    expect(screen.getAllByTestId("terminal-view")).toHaveLength(2);
    expect(document.querySelector('[data-tab-id="terminal-tab-1"]')).toBeTruthy();
    expect(document.querySelector('[data-tab-id="terminal-tab-2"]')).toBeTruthy();
  });

  it("requests content focus when selected tab changes outside the tab bar", () => {
    mocked.stateRef.current = {
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          branch: "origin/main",
          title: "Workspace 1",
          name: "Workspace 1",
          worktreePath: "/tmp/workspace-1",
        },
      ],
      projects: [{ id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" }],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-1",
      tabs: [
        {
          id: "terminal-tab-1",
          workspaceId: "workspace-1",
          title: "Terminal A",
          pinned: false,
          kind: "terminal",
          data: {
            title: "Terminal A",
          },
        },
        {
          id: "terminal-tab-2",
          workspaceId: "workspace-1",
          title: "Terminal B",
          pinned: false,
          kind: "terminal",
          data: {
            title: "Terminal B",
          },
        },
      ],
      selectedTabId: "terminal-tab-1",
      listDetectedPorts: vi.fn().mockResolvedValue([]),
      setSelectedRepoId: vi.fn(),
      setSelectedWorkspaceId: vi.fn(),
      selectTab: vi.fn(),
      createTab: vi.fn(),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      toggleTabPinned: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      readFile: vi.fn(),
      readDiff: vi.fn(),
      readCommitDiff: vi.fn(),
      readBranchComparisonDiff: vi.fn(),
      refreshFileTabFromDisk: vi.fn(),
      refreshDiffTabContent: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
    };

    const view = render(<MainPaneView />);
    expect(document.querySelector('[data-tab-id="terminal-tab-1"]')?.getAttribute("data-focus-request-key")).toBe("0");

    mocked.stateRef.current = {
      ...mocked.stateRef.current,
      selectedTabId: "terminal-tab-2",
    };
    view.rerender(<MainPaneView />);

    expect(document.querySelector('[data-tab-id="terminal-tab-2"]')?.getAttribute("data-focus-request-key")).toBe("1");
  });

  it("shows launch view when selected workspace has no tabs", () => {
    mocked.stateRef.current = {
      workspaces: [
        {
          id: "workspace-1",
          repoId: "repo-1",
          branch: "origin/main",
          title: "Workspace 1",
          name: "Workspace 1",
          worktreePath: "/tmp/workspace-1",
        },
        {
          id: "workspace-empty",
          repoId: "repo-1",
          branch: "feature/empty",
          title: "Workspace Empty",
          name: "Workspace Empty",
          worktreePath: "/tmp/workspace-empty",
        },
      ],
      projects: [{ id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" }],
      selectedProjectId: "repo-1",
      selectedWorkspaceId: "workspace-empty",
      tabs: [
        {
          id: "terminal-tab-1",
          workspaceId: "workspace-1",
          title: "Terminal A",
          pinned: false,
          kind: "terminal",
          data: {
            title: "Terminal A",
          },
        },
      ],
      selectedTabId: "",
      listDetectedPorts: vi.fn().mockResolvedValue([]),
      setSelectedRepoId: vi.fn(),
      setSelectedWorkspaceId: vi.fn(),
      selectTab: vi.fn(),
      createTab: vi.fn(),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      toggleTabPinned: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      readFile: vi.fn(),
      readDiff: vi.fn(),
      readCommitDiff: vi.fn(),
      readBranchComparisonDiff: vi.fn(),
      refreshFileTabFromDisk: vi.fn(),
      refreshDiffTabContent: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
    };

    render(<MainPaneView />);

    // Empty workspace shows the launch view; workspace-1's terminal stays mounted (hidden)
    expect(screen.getByTestId("launch-view")).toBeTruthy();
    expect(screen.queryAllByTestId("terminal-view")).toHaveLength(1);
  });

  it("opens an agent terminal tab when tab bar create option is selected", () => {
    const openTab = vi.fn();
    mocked.stateRef.current = {
      ...buildStoreState(false),
      openTab,
    };

    render(<MainPaneView />);

    fireEvent.click(screen.getByRole("button", { name: "create-codex" }));

    expect(openTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "terminal",
      title: "settings.agents.items.codex",
      launchCommand: "codex",
      agentKind: "codex",
      reuseExisting: false,
    });
  });

  it("hides disabled agents from tab creation menu", () => {
    const openTab = vi.fn();
    agentSettingsStore.setState({
      inUseByAgentKind: {
        opencode: true,
        codex: false,
        claude: true,
        gemini: true,
        pi: true,
        copilot: true,
        cursor: true,
      },
    });
    mocked.stateRef.current = {
      ...buildStoreState(false),
      openTab,
    };

    render(<MainPaneView />);

    expect(screen.queryByRole("button", { name: "create-codex" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "create-terminal" }));
    expect(openTab).toHaveBeenCalledTimes(1);
  });

  it("opens a plain terminal tab when terminal create option is selected", () => {
    const openTab = vi.fn();
    mocked.stateRef.current = {
      ...buildStoreState(false),
      openTab,
    };

    render(<MainPaneView />);

    fireEvent.click(screen.getByRole("button", { name: "create-terminal" }));

    expect(openTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "terminal",
      title: "terminal.title",
      reuseExisting: false,
    });
  });

  it("shows pane toggle buttons and triggers callbacks", () => {
    const onToggleLeftPane = vi.fn();
    const onToggleRightPane = vi.fn();
    mocked.stateRef.current = buildStoreState(false);
    mocked.getMainWindowFullscreenState.mockResolvedValue({ isFullscreen: false });

    render(
      <WorkspacePaneVisibilityProvider
        value={{
          leftCollapsed: true,
          rightCollapsed: true,
          onToggleLeftPane,
          onToggleRightPane,
        }}
      >
        <MainPaneView />
      </WorkspacePaneVisibilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "layout.toggleLeftSidebar" }));
    fireEvent.click(screen.getByRole("button", { name: "layout.toggleRightSidebar" }));

    expect(screen.getByTestId("main-pane-macos-controls-inset")).toBeTruthy();
    expect(onToggleLeftPane).toHaveBeenCalledTimes(1);
    expect(onToggleRightPane).toHaveBeenCalledTimes(1);
  });

  it("does not reserve mac controls inset in fullscreen display mode", async () => {
    mocked.stateRef.current = buildStoreState(false);
    mocked.getMainWindowFullscreenState.mockResolvedValue({ isFullscreen: true });

    render(
      <WorkspacePaneVisibilityProvider
        value={{
          leftCollapsed: true,
          rightCollapsed: true,
          onToggleLeftPane: vi.fn(),
          onToggleRightPane: vi.fn(),
        }}
      >
        <MainPaneView />
      </WorkspacePaneVisibilityProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("main-pane-macos-controls-inset")).toBeNull();
    });
  });

  it("marks the main pane top header as draggable", () => {
    mocked.stateRef.current = buildStoreState(false);

    render(<MainPaneView />);

    const repoSelectorButton = screen.getByRole("button", { name: "project.selected" });
    const header = repoSelectorButton.closest("header");
    expect(header?.classList.contains("electron-webkit-app-region-drag")).toBe(true);
  });

  it("shows repo and workspace title dropdowns and allows switching", () => {
    const setSelectedRepoId = vi.fn();
    const setSelectedWorkspaceId = vi.fn();
    mocked.stateRef.current = {
      ...buildStoreState(false),
      projects: [
        { id: "repo-1", name: "Repo One", path: "/tmp/repo-1" },
        { id: "repo-2", name: "Repo Two", path: "/tmp/repo-2" },
      ],
      selectedProjectId: "repo-1",
      workspaces: [
        { id: "workspace-1", repoId: "repo-1", name: "Workspace 1", branch: "origin/main", title: "Workspace 1" },
        { id: "workspace-2", repoId: "repo-1", name: "Workspace 2", branch: "feature/a", title: "Workspace 2" },
      ],
      selectedWorkspaceId: "workspace-1",
      setSelectedRepoId,
      setSelectedWorkspaceId,
    };

    render(<MainPaneView />);

    fireEvent.click(screen.getByRole("button", { name: "project.selected" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Repo Two" }));

    expect(setSelectedRepoId).toHaveBeenCalledWith("repo-2");

    fireEvent.click(screen.getByRole("button", { name: "workspace.column" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Workspace 2" }));

    expect(setSelectedWorkspaceId).toHaveBeenCalledWith("workspace-2");
  });

  it("filters repo and workspace dropdown items with search", () => {
    mocked.stateRef.current = {
      ...buildStoreState(false),
      projects: [
        { id: "repo-1", name: "Alpha Repo", path: "/tmp/repo-1" },
        { id: "repo-2", name: "Beta Repo", path: "/tmp/repo-2" },
      ],
      selectedProjectId: "repo-1",
      workspaces: [
        { id: "workspace-1", repoId: "repo-1", name: "Alpha Workspace", branch: "origin/main", title: "Alpha" },
        { id: "workspace-2", repoId: "repo-1", name: "Beta Workspace", branch: "feature/b", title: "Beta" },
      ],
    };

    render(<MainPaneView />);

    fireEvent.click(screen.getByRole("button", { name: "project.selected" }));
    fireEvent.change(screen.getByRole("textbox", { name: "org.menu.search.repo" }), {
      target: { value: "beta" },
    });
    expect(screen.queryByRole("menuitem", { name: "Alpha Repo" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Beta Repo" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "workspace.column" }));
    fireEvent.change(screen.getByRole("textbox", { name: "org.menu.search.workspace" }), {
      target: { value: "beta" },
    });
    expect(screen.queryByRole("menuitem", { name: "Alpha Workspace" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Beta Workspace" })).toBeTruthy();
  });

  it("shows workspace ports summary and popup entries", async () => {
    const setSelectedWorkspaceId = vi.fn();
    const selectTab = vi.fn();
    mocked.stateRef.current = {
      ...buildStoreState(false),
      tabs: [
        {
          id: "terminal-tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: {
            title: "Terminal",
            sessionId: "session-1",
          },
        },
      ],
      setSelectedWorkspaceId,
      selectTab,
      listDetectedPorts: vi.fn().mockResolvedValue([
        {
          sessionId: "session-1",
          workspaceId: "workspace-1",
          port: 3000,
          pid: 12345,
          processName: "node",
          address: "127.0.0.1",
        },
        {
          sessionId: "session-2",
          workspaceId: "workspace-2",
          port: 9000,
          pid: 99999,
          processName: "node",
          address: "127.0.0.1",
        },
      ]),
    };

    render(<MainPaneView />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "terminal.ports.toggleLabel" })).toBeTruthy();
      expect(screen.getByText("Port: 3000")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "terminal.ports.toggleLabel" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /node.*3000.*12345/ }));
    expect(setSelectedWorkspaceId).toHaveBeenCalledWith("workspace-1");
    expect(selectTab).toHaveBeenCalledWith("terminal-tab-1");
  });

  it("skips port polling when selected workspace has no terminal tabs", async () => {
    const listDetectedPorts = vi.fn().mockResolvedValue([]);
    mocked.stateRef.current = {
      ...buildStoreState(false),
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
      listDetectedPorts,
    };

    render(<MainPaneView />);

    await waitFor(() => {
      expect(listDetectedPorts).not.toHaveBeenCalled();
    });
  });

  it("loads detected ports once and does not auto-poll", async () => {
    vi.useFakeTimers();
    try {
      const pendingResolves: Array<(value: Array<unknown>) => void> = [];
      const listDetectedPorts = vi.fn().mockImplementation(
        () =>
          new Promise<Array<unknown>>((resolve) => {
            pendingResolves.push(resolve);
          }),
      );

      mocked.stateRef.current = {
        ...buildStoreState(false),
        tabs: [
          {
            id: "terminal-tab-1",
            workspaceId: "workspace-1",
            title: "Terminal",
            pinned: false,
            kind: "terminal",
            data: {
              title: "Terminal",
              sessionId: "session-1",
            },
          },
        ],
        listDetectedPorts,
      };

      render(<MainPaneView />);

      await Promise.resolve();
      expect(listDetectedPorts).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(9000);
      expect(listDetectedPorts).toHaveBeenCalledTimes(1);

      const resolveFirst = pendingResolves.shift();
      resolveFirst?.([]);
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }
  });
});
