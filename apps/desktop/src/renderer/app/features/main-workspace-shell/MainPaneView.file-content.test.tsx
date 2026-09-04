// @vitest-environment jsdom

import { AGENT_SETTINGS_STORE_STORAGE_KEY } from "@renderer/domains/agent";
import { agentSettingsStore } from "@renderer/domains/agent/state/agentSettingsStore";
import { WorkspacePaneVisibilityProvider, layoutStore } from "@renderer/domains/workbench";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileTabContentStore } from "../../../domains/files/state/fileTabContentStore";
import type { SplitPaneNode } from "../../../domains/workbench/split-pane";
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

  const workspaceState = () => ({
    pullRequestByWorkspaceId: {},
    latestPullRequestByWorkspaceId: {},
    gitChangesCountByWorkspaceId: {},
    setAgentChatTabRuntime: vi.fn(),
    ...stateRef.current,
  });
  const workspaceStore = vi.fn((selector: (state: Record<string, unknown>) => unknown) => selector(workspaceState()));
  Object.assign(workspaceStore, { getState: workspaceState });

  return {
    stateRef,
    workspaceStore,
    getMainWindowFullscreenState: vi.fn(async () => ({ isFullscreen: false })),
    activateProject: vi.fn(),
    activateWorkspace: vi.fn(),
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
    activateProject: (...args: unknown[]) => {
      const fn = mocked.stateRef.current.activateProject as ((...a: unknown[]) => unknown) | undefined;
      if (fn) return fn.apply(null, args);
      return (mocked.activateProject as (...a: unknown[]) => unknown).apply(null, args);
    },
    activateWorkspace: (...args: unknown[]) => {
      const fn = mocked.stateRef.current.activateWorkspace as ((...a: unknown[]) => unknown) | undefined;
      if (fn) return fn.apply(null, args);
      return (mocked.activateWorkspace as (...a: unknown[]) => unknown).apply(null, args);
    },
    RightPaneTabBar: ({
      tabs,
      onSelectTab,
    }: {
      tabs: Array<{ value: "files" | "tasks" | "changes" | "pr"; label: string; icon: React.ReactNode }>;
      onSelectTab: (tab: "files" | "tasks" | "changes" | "pr") => void;
    }) => (
      <div data-testid="mock-right-pane-tab-bar">
        {tabs.map((tab) => (
          <button key={tab.value} type="button" aria-label={tab.label} onClick={() => onSelectTab(tab.value)}>
            {tab.icon}
            {tab.value}
          </button>
        ))}
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

vi.mock("../../../domains/agent/state/workspaceAgentIndicatorStore", () => ({
  workspaceAgentIndicatorStore: (
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
    listDetectedPorts: (...args: unknown[]) => {
      const stateFn = mocked.stateRef.current.listDetectedPorts as ((...a: unknown[]) => unknown) | undefined;
      return stateFn ? stateFn.apply(null, args) : Promise.resolve([]);
    },
    subscribeDetectedPorts: (...args: unknown[]) => {
      const stateFn = mocked.stateRef.current.subscribeDetectedPorts as ((...a: unknown[]) => unknown) | undefined;
      return stateFn
        ? stateFn.apply(null, args)
        : (mocked.subscribeDetectedPorts as (...a: unknown[]) => unknown).apply(null, args);
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.removeItem(AGENT_SETTINGS_STORE_STORAGE_KEY);
  layoutStore.setState({ rightPaneTabByWorkspaceId: {} });
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

import { buildMainPaneStoreState } from "./MainPaneView.testSupport";

describe("MainPaneView", () => {
  it("renders unsupported file view for unsupported file tabs", () => {
    fileTabContentStore.getState().seed({
      tabId: "tab-unsupported-1",
      path: "data/main.sqlite",
      content: "",
      isUnsupported: true,
    });
    mocked.stateRef.current = {
      ...buildMainPaneStoreState(false),
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
      ...buildMainPaneStoreState(false),
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
});
