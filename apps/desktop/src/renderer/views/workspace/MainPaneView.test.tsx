// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspacePaneVisibilityProvider } from "../../hooks/useWorkspacePaneVisibility";
import { AGENT_SETTINGS_STORE_STORAGE_KEY, agentSettingsStore } from "../../store/agentSettingsStore";
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

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => {
    const state = mocked.stateRef.current as Record<string, unknown>;
    return {
      listDetectedPorts: state.listDetectedPorts,
      getTerminalResourceUsage: state.getTerminalResourceUsage ?? mocked.getTerminalResourceUsage,
      setSelectedRepoId: state.setSelectedRepoId,
      setSelectedWorkspaceId: state.setSelectedWorkspaceId,
      setSelectedTabId: state.setSelectedTabId,
      createTab: state.createTab,
      openTab: state.openTab,
      closeTab: state.closeTab,
      closeOtherTabs: state.closeOtherTabs,
      closeAllTabs: state.closeAllTabs,
      toggleTabPinned: state.toggleTabPinned,
      reorderTab: state.reorderTab,
      renameTab: state.renameTab,
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

vi.mock("../../components/ProjectDiffViewer", () => ({
  ProjectDiffViewer: () => <div data-testid="repo-diff-viewer" />,
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
    onCreateTab: (option: "terminal" | "opencode" | "codex" | "claude") => void;
    enabledAgentKinds?: Array<"opencode" | "codex" | "claude">;
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

vi.mock("../../components/FileEditor", () => ({
  FileEditor: () => <div data-testid="file-editor-view" />,
}));

vi.mock("./LaunchView", () => ({
  LaunchView: () => <div data-testid="launch-view" />,
}));

vi.mock("./TerminalView", () => ({
  TerminalView: ({ tabId }: { tabId: string }) => <div data-testid="terminal-view" data-tab-id={tabId} />,
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
    setSelectedTabId: vi.fn(),
    createTab: vi.fn(),
    openTab: vi.fn(),
    closeTab: vi.fn(),
    closeOtherTabs: vi.fn(),
    closeAllTabs: vi.fn(),
    toggleTabPinned: vi.fn(),
    reorderTab: vi.fn(),
    renameTab: vi.fn(),
    updateFileTabContent: vi.fn(),
    markFileTabSaved: vi.fn(),
  };
}

describe("MainPaneView", () => {
  it("shows chat-disabled placeholder for session tabs", () => {
    mocked.stateRef.current = buildStoreState(true);

    render(<MainPaneView />);

    expect(screen.getByTestId("tab-bar").textContent).toContain("Chat A");
    expect(screen.getByText("Chat is currently disabled.")).toBeTruthy();
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
      setSelectedTabId: vi.fn(),
      createTab: vi.fn(),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      toggleTabPinned: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
    };

    render(<MainPaneView />);

    const terminalView = screen.getByTestId("terminal-view");
    expect(terminalView.getAttribute("data-tab-id")).toBe("terminal-tab-1");
  });

  it("keeps terminal views mounted across workspace switches while tab strip stays scoped", () => {
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
      setSelectedTabId: vi.fn(),
      createTab: vi.fn(),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      toggleTabPinned: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
    };

    render(<MainPaneView />);

    expect(screen.getByTestId("tab-bar").textContent).toContain("Terminal A");
    expect(screen.getByTestId("tab-bar").textContent).not.toContain("Terminal B");
    expect(screen.getAllByTestId("terminal-view")).toHaveLength(2);
    expect(document.querySelector('[data-tab-id="terminal-tab-1"]')).toBeTruthy();
    expect(document.querySelector('[data-tab-id="terminal-tab-2"]')).toBeTruthy();
  });

  it("keeps existing terminal views mounted when selected workspace has no tabs", () => {
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
      setSelectedTabId: vi.fn(),
      createTab: vi.fn(),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      toggleTabPinned: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
    };

    render(<MainPaneView />);

    expect(screen.getByTestId("launch-view")).toBeTruthy();
    expect(screen.getAllByTestId("terminal-view")).toHaveLength(1);
    expect(document.querySelector('[data-tab-id="terminal-tab-1"]')).toBeTruthy();
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
      title: "Codex",
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
    const setSelectedTabId = vi.fn();
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
      setSelectedTabId,
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
    fireEvent.click(screen.getByRole("menuitem", { name: /127\.0\.0\.1:3000.*12345.*node/ }));
    expect(setSelectedWorkspaceId).toHaveBeenCalledWith("workspace-1");
    expect(setSelectedTabId).toHaveBeenCalledWith("terminal-tab-1");
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

  it("prevents overlapping port polling while one request is in flight", async () => {
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

      await vi.advanceTimersByTimeAsync(3000);
      expect(listDetectedPorts).toHaveBeenCalledTimes(2);

      const resolveSecond = pendingResolves.shift();
      resolveSecond?.([]);
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }
  });
});
