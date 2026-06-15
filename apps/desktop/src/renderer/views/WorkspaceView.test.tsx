// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionStore } from "../store/sessionStore";
import { layoutStore } from "../store/settings/layoutStore";
import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";
import { workspaceUiStore } from "../store/workspaceUiStore";
import { WorkspaceView } from "./WorkspaceView";

const commandMocks = {
  closeTab: vi.fn(),
  deleteSelectedFileTreeEntry: vi.fn(),
  loadWorkspaceSnapshot: vi.fn(async () => undefined),
  openEntryInExternalApp: vi.fn(async () => undefined),
  openTab: vi.fn(),
  refreshWorkspaceGitChanges: vi.fn(async () => undefined),
  selectTab: vi.fn(),
  setActiveWorkspace: vi.fn(async () => undefined),
  setLeftPaneWidth: vi.fn(),
  setSelectedRepoId: vi.fn(),
  setSelectedWorkspaceId: vi.fn(),
  toggleLeftPaneVisibility: vi.fn(),
  toggleRightPaneVisibility: vi.fn(),
  undoFileTreeOperation: vi.fn(),
};

const terminalRecoveryMocks = {
  restoreTerminalTabsFromRegistry: vi.fn(() => undefined),
  startPersistingTerminalTabs: vi.fn(() => vi.fn()),
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../components/SplitPaneLayout", () => ({
  SplitPaneLayout: ({ children }: { children: ReactNode }) => <div data-testid="split-pane-layout">{children}</div>,
}));

vi.mock("../events", () => ({
  subscribeAppActionEvent: vi.fn(() => () => undefined),
}));

vi.mock("../hooks/useAllWorkspacesGitSync", () => ({
  useAllWorkspacesGitSync: vi.fn(),
}));

vi.mock("../hooks/useCommands", () => ({
  useCommands: () => commandMocks,
}));

vi.mock("../hooks/useWorkspacePaneVisibility", () => ({
  WorkspacePaneVisibilityProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useWorkspacePaneVisibility: () => ({ leftCollapsed: false, onToggleLeftPane: vi.fn() }),
}));

vi.mock("./overview/OverviewView", () => ({
  OverviewView: () => <div data-testid="overview-view" />,
}));

vi.mock("./scheduledJob/ScheduledJobView", () => ({
  ScheduledJobView: () => <div data-testid="scheduled-job-view" />,
}));

vi.mock("./workspace/LeftPane/CreateProjectDialogView", () => ({
  CreateProjectDialogView: () => null,
}));

vi.mock("./workspace/LeftPane/LeftPaneView", () => ({
  LeftPaneView: () => <div data-testid="left-pane-view" />,
}));

vi.mock("./workspace/MainPaneView", () => ({
  MainPaneView: () => <div data-testid="main-pane-view" />,
}));

vi.mock("./workspace/OnboardingView", () => ({
  OnboardingView: () => <div data-testid="onboarding-view" />,
}));

vi.mock("./workspace/WorkspaceLifecycleNoticeView", () => ({
  WorkspaceLifecycleNoticeView: () => null,
}));

vi.mock("./workspace/terminal/terminalRecovery", () => ({
  TerminalRecoveryCoordinator: vi.fn(
    class {
      restoreTerminalTabsFromRegistry = terminalRecoveryMocks.restoreTerminalTabsFromRegistry;
      startPersistingTerminalTabs = terminalRecoveryMocks.startPersistingTerminalTabs;
    },
  ),
}));

describe("WorkspaceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    layoutStore.setState({ leftWidth: 280 });
    sessionStore.setState({
      authStatusResolved: true,
      currentUser: null,
      isAuthenticated: true,
      loaded: true,
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
    });
    tabStore.setState({ tabs: [], selectedTabId: null });
    workspaceStore.setState({
      displayProjectIds: [],
      gitRefreshVersionByWorktreePath: {},
      lastUsedExternalAppId: null,
      projects: [],
      selectedRepoId: "",
      selectedWorkspaceId: "",
      workspaces: [],
    });
    workspaceUiStore.setState({ overlayPanel: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the workspace snapshot on mount and again when selected organization changes", async () => {
    render(
      <MemoryRouter>
        <WorkspaceView />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(commandMocks.loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    });

    sessionStore.getState().setSessionData({
      currentUser: null,
      organizations: [{ id: "org-2", name: "Org 2" }],
      selectedOrganizationId: "org-2",
    });

    await waitFor(() => {
      expect(commandMocks.loadWorkspaceSnapshot).toHaveBeenCalledTimes(2);
    });
  });

  it("restores terminal tabs only once across organization changes", async () => {
    render(
      <MemoryRouter>
        <WorkspaceView />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(terminalRecoveryMocks.restoreTerminalTabsFromRegistry).toHaveBeenCalledTimes(1);
      expect(terminalRecoveryMocks.startPersistingTerminalTabs).toHaveBeenCalledTimes(1);
    });

    sessionStore.getState().setSessionData({
      currentUser: null,
      organizations: [{ id: "org-2", name: "Org 2" }],
      selectedOrganizationId: "org-2",
    });

    await waitFor(() => {
      expect(commandMocks.loadWorkspaceSnapshot).toHaveBeenCalledTimes(2);
    });

    expect(terminalRecoveryMocks.restoreTerminalTabsFromRegistry).toHaveBeenCalledTimes(1);
    expect(terminalRecoveryMocks.startPersistingTerminalTabs).toHaveBeenCalledTimes(1);
  });
});
