// @vitest-environment jsdom

import { AGENT_SETTINGS_STORE_STORAGE_KEY } from "@renderer/domains/agent";
import { agentSettingsStore } from "@renderer/domains/agent/state/agentSettingsStore";
import { WorkspacePaneVisibilityProvider } from "@renderer/domains/workbench";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileTabContentStore } from "../../../domains/files/state/fileTabContentStore";
import type { SplitPaneNode } from "../../../domains/workbench/model/split-pane";
import { MainPaneView } from "./MainPaneView";

type MockLeafPane = {
  kind: "leaf";
  id: string;
  tabIds: string[];
  selectedTabId: string;
};

const mocked = vi.hoisted(() => {
  const stateRef: { current: Record<string, unknown> } = {
    current: {},
  };

  const workspaceStore = vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      gitChangesCountByWorkspaceId: {},
      ...stateRef.current,
    }),
  );

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
    subscribeDetectedPorts: vi.fn(() => () => {}),
  };
});

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useInRouterContext: () => false,
}));

vi.mock("../../../domains/session/state/sessionStore", () => ({
  sessionStore: (selector: (state: { daemonVersion?: string; appVersion?: string }) => unknown) =>
    selector({ daemonVersion: "1.0.0", appVersion: "1.0.0" }),
}));

vi.mock("../../../domains/workspace/state/workspaceStore", () => ({
  workspaceStore: mocked.workspaceStore,
}));

vi.mock("@renderer/domains/workbench", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/workbench")>();
  const navStore = vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeProjectId: mocked.stateRef.current.selectedProjectId ?? "",
      activeWorkspaceId: mocked.stateRef.current.selectedWorkspaceId ?? "",
      overlayPanel: null,
    }),
  );
  Object.assign(navStore, {
    getState: () => ({
      activeProjectId: mocked.stateRef.current.selectedProjectId ?? "",
      activeWorkspaceId: mocked.stateRef.current.selectedWorkspaceId ?? "",
      overlayPanel: null,
      setActiveProjectId: vi.fn((projectId: string) => {
        mocked.stateRef.current.selectedProjectId = projectId;
      }),
      setActiveWorkspaceId: vi.fn((workspaceId: string) => {
        mocked.stateRef.current.selectedWorkspaceId = workspaceId;
      }),
      setOverlayPanel: vi.fn(),
      closeOverlayPanel: vi.fn(),
    }),
    setState: vi.fn(),
  });
  return {
    ...actual,
    workbenchNavigationStore: navStore,
    RightPaneTabBar: () => (
      <div data-testid="mock-right-pane-tab-bar">
        <button type="button" aria-label="files.files">
          files
        </button>
        <button type="button" aria-label="files.changes">
          changes
        </button>
        <button type="button" aria-label="workspace.pr.tab">
          pr
        </button>
      </div>
    ),
  };
});

vi.mock("../../../domains/project/state/projectStore", () => {
  const projectStore = (selector: (state: { projects: unknown[]; displayProjectIds: string[] }) => unknown) =>
    selector({
      projects: (mocked.stateRef.current.projects as unknown[] | undefined) ?? [],
      displayProjectIds: (mocked.stateRef.current.displayProjectIds as string[] | undefined) ?? [],
    });
  (
    projectStore as unknown as {
      getState: () => { projects: unknown[]; displayProjectIds: string[] };
    }
  ).getState = () => ({
    projects: (mocked.stateRef.current.projects as unknown[] | undefined) ?? [],
    displayProjectIds: (mocked.stateRef.current.displayProjectIds as string[] | undefined) ?? [],
  });
  return { projectStore };
});

vi.mock("../../../domains/workbench/state/tabStore", () => ({
  tabStore: mocked.workspaceStore,
}));

vi.mock("../../../domains/agent/state/chatStore", () => ({
  chatStore: (
    selector: (state: {
      workspaceUnreadToneByWorkspaceId: Record<string, "success" | "error">;
      workspaceAgentStatusByWorkspaceId: Record<string, "running" | "waiting_input" | "idle">;
    }) => unknown,
  ) =>
    selector({
      workspaceUnreadToneByWorkspaceId:
        (mocked.stateRef.current.workspaceUnreadToneByWorkspaceId as Record<string, "success" | "error"> | undefined) ??
        {},
      workspaceAgentStatusByWorkspaceId:
        (mocked.stateRef.current.workspaceAgentStatusByWorkspaceId as
          | Record<string, "running" | "waiting_input" | "idle">
          | undefined) ?? {},
    }),
}));

vi.mock("../../../app/commands/useCommands", () => {
  const commandSurface = () => {
    const state = mocked.stateRef.current as Record<string, unknown>;
    return {
      listDetectedPorts: state.listDetectedPorts,
      subscribeDetectedPorts: state.subscribeDetectedPorts ?? mocked.subscribeDetectedPorts,
      getTerminalResourceUsage: state.getTerminalResourceUsage ?? mocked.getTerminalResourceUsage,
      retainOpenTerminalTabFocus: state.retainOpenTerminalTabFocus ?? vi.fn(),
      activateProject: state.activateProject,
      activateWorkspace: state.activateWorkspace,
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
  };
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

vi.mock("@renderer/platform/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../../app/commands/appCommands", () => ({
  getMainWindowFullscreenState: () => mocked.getMainWindowFullscreenState(),
}));

vi.mock("../../../domains/files/commands/fileCommands", () => ({
  listDetectedExternalAppIds: vi.fn(async () => []),
  writeFile: vi.fn(),
}));

vi.mock("../../../domains/workbench/features/workspace-tabs/pane/TabBar", () => ({
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

vi.mock("../../../domains/workbench/features/workspace-tabs/pane/SplitPaneGroup", () => ({
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

vi.mock("../../../domains/workbench/features/workspace-tabs/pane/SplitPaneContainer", () => ({
  SplitPaneContainer: ({
    node,
    renderPane,
  }: {
    node: { kind: string; id: string; tabIds?: string[]; selectedTabId?: string };
    renderPane: (pane: { id: string; tabIds: string[]; selectedTabId: string }) => React.ReactNode;
  }) => {
    // For a leaf, render the pane directly
    if (node.kind === "leaf" && node.tabIds && typeof node.selectedTabId === "string") {
      return (
        <div data-testid="split-container">
          {renderPane({ id: node.id, tabIds: node.tabIds, selectedTabId: node.selectedTabId })}
        </div>
      );
    }
    // For a branch, render both children
    return <div data-testid="split-container">split-branch</div>;
  },
}));

vi.mock("../../../domains/workbench/features/workspace-tabs/pane/SplitDropZone", () => ({
  SplitDropZone: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  resolveDropResult: () => null,
}));

vi.mock("./RightPaneView", () => ({
  RightPaneView: () => <div data-testid="mock-right-pane-view" />,
}));

vi.mock("../../../domains/workbench/state/splitPaneStore", () => {
  // Builds a root pane for a given workspace from the current test state.
  function buildRootPaneForWorkspace(workspaceId: string): MockLeafPane {
    const state = mocked.stateRef.current as Record<string, unknown>;
    const tabs = (state.tabs ?? []) as Array<{ id: string; workspaceId: string }>;
    const selectedTabId = (state.selectedTabId ?? "") as string;
    const workspaceTabIds = tabs.filter((tab) => tab.workspaceId === workspaceId).map((tab) => tab.id);
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
    const result: Record<string, { root: SplitPaneNode; activePaneId: string }> = {};
    for (const wsId of workspaceIds) {
      result[wsId] = { root: buildRootPaneForWorkspace(wsId), activePaneId: "root-pane" };
    }
    return result;
  }

  return {
    splitPaneStore: Object.assign(
      (selector: (state: { layoutByWorkspaceId: ReturnType<typeof buildLayoutByWorkspaceId> }) => unknown) => {
        return selector({ layoutByWorkspaceId: buildLayoutByWorkspaceId() });
      },
      {
        getState: () => {
          const selectedWorkspaceId =
            ((mocked.stateRef.current as Record<string, unknown>).selectedWorkspaceId as string) ?? "";
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

vi.mock("@renderer/domains/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/files")>();
  return {
    ...actual,
    FileDiffViewer: () => <div data-testid="repo-diff-viewer" />,
    FileEditor: ({ isDeleted }: { isDeleted?: boolean }) => (
      <div data-testid="file-editor-view" data-is-deleted={isDeleted ? "true" : "false"} />
    ),
    UnsupportedFileView: ({ path, hint }: { path: string; hint?: string }) => (
      <div data-testid="unsupported-file-view" data-hint={hint ?? ""}>
        {path}
      </div>
    ),
  };
});

vi.mock("../launch/LaunchView", () => ({
  LaunchView: () => <div data-testid="launch-view" />,
}));

vi.mock("@renderer/domains/terminal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/terminal")>();
  return {
    ...actual,
    TerminalView: ({ tabId, focusRequestKey = 0 }: { tabId: string; focusRequestKey?: number }) => (
      <div data-testid="terminal-view" data-tab-id={tabId} data-focus-request-key={focusRequestKey} />
    ),
    disposeTerminalRuntimesForClosedTabs: vi.fn(),
  };
});

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
    displayProjectIds: ["repo-1"],
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
        kind: "agent-chat",
        data: {
          cwd: "/tmp/project",
          sessionId: isInitializing ? "" : "session-1",
          sessionView: "full",
        },
      },
    ],
    selectedTabId: "tab-1",
    listDetectedPorts: vi.fn().mockResolvedValue([]),
    activateProject: vi.fn(),
    activateWorkspace: vi.fn(),
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
  it("renders unsupported file view for unsupported file tabs", () => {
    fileTabContentStore.getState().seed({
      tabId: "tab-unsupported-1",
      path: "data/main.sqlite",
      content: "",
      isUnsupported: true,
    });
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
            isDirty: false,
            isTemporary: false,
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
    fileTabContentStore.getState().seed({
      tabId: "tab-large-1",
      path: "logs/big.log",
      content: "",
      isUnsupported: true,
      unsupportedReason: "size",
    });
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
            isDirty: false,
            isTemporary: false,
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
      activateProject: vi.fn(),
      activateWorkspace: vi.fn(),
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
      activateProject: vi.fn(),
      activateWorkspace: vi.fn(),
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

  it("does not auto-focus content when selected tab changes programmatically", () => {
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
      activateProject: vi.fn(),
      activateWorkspace: vi.fn(),
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

    // Auto-focus on programmatic tab change was removed — the editor only
    // gets focus when the user explicitly clicks into it.
    expect(document.querySelector('[data-tab-id="terminal-tab-2"]')?.getAttribute("data-focus-request-key")).toBe("0");
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
      activateProject: vi.fn(),
      activateWorkspace: vi.fn(),
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

    expect(openTab).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        kind: "terminal",
        title: "settings.agents.items.codex",
        launchCommand: "codex",
        agentKind: "codex",
        reuseExisting: false,
      },
      { activePaneTabIds: ["tab-1"], workspaceId: "workspace-1" },
    );
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

    expect(openTab).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        kind: "terminal",
        title: "terminal.title",
        reuseExisting: false,
      },
      { activePaneTabIds: ["tab-1"], workspaceId: "workspace-1" },
    );
  });

  it("shows the left pane toggle and right tab bar controls", () => {
    const onToggleLeftPane = vi.fn();
    mocked.stateRef.current = buildStoreState(false);
    mocked.getMainWindowFullscreenState.mockResolvedValue({ isFullscreen: false });

    render(
      <WorkspacePaneVisibilityProvider
        value={{
          leftCollapsed: true,
          rightCollapsed: true,
          onToggleLeftPane,
          onToggleRightPane: vi.fn(),
        }}
      >
        <MainPaneView />
      </WorkspacePaneVisibilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "layout.toggleLeftSidebar" }));

    expect(screen.getByTestId("main-pane-macos-controls-inset")).toBeTruthy();
    expect(screen.getByRole("button", { name: "files.files" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "files.changes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "workspace.pr.tab" })).toBeTruthy();
    expect(onToggleLeftPane).toHaveBeenCalledTimes(1);
  });

  it("shows the error state view and hides the right pane and tab bar for a broken workspace", () => {
    const state = buildStoreState(false);
    // The mock store's inferred workspace shape is narrow; the runtime store
    // accepts any WorkspaceItem, so widen through an explicit cast.
    state.workspaces = [
      {
        id: "workspace-1",
        repoId: "repo-1",
        branch: "origin/main",
        title: "Workspace 1",
        name: "Workspace 1",
        state: "error",
        health: "path-missing",
      },
    ] as unknown as typeof state.workspaces;
    state.tabs = [];
    mocked.stateRef.current = state;
    mocked.getMainWindowFullscreenState.mockResolvedValue({ isFullscreen: false });

    render(
      <WorkspacePaneVisibilityProvider
        value={{
          leftCollapsed: false,
          rightCollapsed: false,
          onToggleLeftPane: vi.fn(),
          onToggleRightPane: vi.fn(),
        }}
      >
        <MainPaneView />
      </WorkspacePaneVisibilityProvider>,
    );

    expect(screen.getByTestId("workspace-error-state")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close workspace" })).toBeTruthy();
    expect(screen.queryByTestId("dashboard-sidebar")).toBeNull();
    expect(screen.queryByRole("button", { name: "files.files" })).toBeNull();
    expect(screen.queryByRole("button", { name: "files.changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "workspace.pr.tab" })).toBeNull();
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
    const activateProject = vi.fn();
    const activateWorkspace = vi.fn();
    mocked.stateRef.current = {
      ...buildStoreState(false),
      projects: [
        { id: "repo-1", name: "Repo One", path: "/tmp/repo-1" },
        { id: "repo-2", name: "Repo Two", path: "/tmp/repo-2" },
      ],
      displayProjectIds: ["repo-1", "repo-2"],
      selectedProjectId: "repo-1",
      workspaces: [
        { id: "workspace-1", repoId: "repo-1", name: "Workspace 1", branch: "origin/main", title: "Workspace 1" },
        { id: "workspace-2", repoId: "repo-1", name: "Workspace 2", branch: "feature/a", title: "Workspace 2" },
      ],
      selectedWorkspaceId: "workspace-1",
      activateProject,
      activateWorkspace,
    };

    render(<MainPaneView />);

    fireEvent.click(screen.getByRole("button", { name: "project.selected" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Repo Two" }));

    expect(activateProject).toHaveBeenCalledWith({ projectId: "repo-2", workspaceId: "" });

    fireEvent.click(screen.getByRole("button", { name: "workspace.column" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Workspace 2" }));

    expect(activateWorkspace).toHaveBeenCalledWith({
      workspaceId: "workspace-2",
      projectId: "repo-1",
    });
  });

  it("keeps a running workspace notification-tinted in the workspace selector", () => {
    mocked.stateRef.current = {
      ...buildStoreState(false),
      workspaceAgentStatusByWorkspaceId: { "workspace-1": "running" },
      workspaceUnreadToneByWorkspaceId: { "workspace-1": "success" },
    };

    render(<MainPaneView />);

    fireEvent.click(screen.getByRole("button", { name: "workspace.column" }));
    const workspaceMenuItem = screen.getByRole("menuitem", { name: "Workspace 1" });
    const workspaceIcon = workspaceMenuItem.querySelector("span");
    expect(workspaceIcon).toBeTruthy();
    expect(getComputedStyle(workspaceIcon as HTMLElement).color).toBe("rgb(46, 125, 50)");
  });

  it("filters repo and workspace dropdown items with search", () => {
    mocked.stateRef.current = {
      ...buildStoreState(false),
      projects: [
        { id: "repo-1", name: "Alpha Repo", path: "/tmp/repo-1" },
        { id: "repo-2", name: "Beta Repo", path: "/tmp/repo-2" },
      ],
      displayProjectIds: ["repo-1", "repo-2"],
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

  it("hides projects removed from the left pane from the header repo menu", () => {
    mocked.stateRef.current = {
      ...buildStoreState(false),
      projects: [
        { id: "repo-1", name: "Repo One", path: "/tmp/repo-1" },
        { id: "repo-2", name: "Repo Two", path: "/tmp/repo-2" },
      ],
      displayProjectIds: ["repo-1"],
      selectedProjectId: "repo-1",
    };

    render(<MainPaneView />);

    fireEvent.click(screen.getByRole("button", { name: "project.selected" }));

    expect(screen.getByRole("menuitem", { name: "Repo One" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Repo Two" })).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "org.menu.search.repo" }), {
      target: { value: "repo two" },
    });

    expect(screen.queryByRole("menuitem", { name: "Repo Two" })).toBeNull();
  });

  it("shows workspace ports summary and popup entries", async () => {
    const activateWorkspace = vi.fn();
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
      activateWorkspace,
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
    expect(activateWorkspace).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
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
          kind: "agent-chat",
          data: {
            cwd: "/tmp/project",
            sessionId: "chat-session-1",
            sessionView: "full",
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
