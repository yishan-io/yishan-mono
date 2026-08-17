// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/features/workbench";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { switchOrganization } from "../../features/organization/commands/orgCommands";
import { projectStore } from "../../features/project/state/projectStore";
import { sessionStore } from "../../features/session/state/sessionStore";
import { layoutStore } from "../../features/workbench/state/layoutStore";
import { tabStore } from "../../features/workbench/state/tabStore";
import { workspaceStore } from "../../features/workspace/state/workspaceStore";
import { WorkspaceView } from "./WorkspaceView";

const commandMocks = {
  closeTab: vi.fn(),
  deleteSelectedFileTreeEntry: vi.fn(),
  listTerminalSessions: vi.fn(async () => []),
  loadWorkspaceSnapshot: vi.fn(async () => undefined),
  openEntryInExternalApp: vi.fn(async () => undefined),
  openTab: vi.fn(),
  refreshWorkspaceGitChanges: vi.fn(async () => undefined),
  selectTab: vi.fn(),
  setActiveWorkspace: vi.fn(async () => undefined),
  setLeftPaneWidth: vi.fn(),
  activateProject: vi.fn(),
  activateWorkspace: vi.fn(),
  toggleLeftPaneVisibility: vi.fn(),
  toggleRightPaneVisibility: vi.fn(),
  undoFileTreeOperation: vi.fn(),
};

const terminalRecoveryMocks = {
  restoreTerminalTabsFromDaemon: vi.fn(async () => undefined),
  startPersistingTerminalTabs: vi.fn(() => vi.fn()),
};

const rpcMocks = vi.hoisted(() => ({
  setCurrentOrg: vi.fn(async () => undefined),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../components/SplitPaneLayout", () => ({
  SplitPaneLayout: ({ children }: { children: ReactNode }) => <div data-testid="split-pane-layout">{children}</div>,
}));

vi.mock("../../events", () => ({
  subscribeAppActionEvent: vi.fn(() => () => undefined),
}));

vi.mock("../../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    context: {
      setCurrentOrg: rpcMocks.setCurrentOrg,
    },
  })),
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
}));

vi.mock("../../features/workspace/ui/hooks/useAllWorkspacesGitSync", () => ({
  useAllWorkspacesGitSync: vi.fn(),
}));

vi.mock("../../app/commands/useCommands", () => {
  const commandSurface = () => commandMocks;
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

vi.mock("../../features/workspace/ui/hooks/useWorkspacePaneVisibility", () => ({
  WorkspacePaneVisibilityProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useWorkspacePaneVisibility: () => ({ leftCollapsed: false, onToggleLeftPane: vi.fn() }),
}));

vi.mock("../../features/overview/ui/OverviewView", () => ({
  OverviewView: () => <div data-testid="overview-view" />,
}));

vi.mock("../../features/scheduled-job/ui/ScheduledJobView", () => ({
  ScheduledJobView: () => <div data-testid="scheduled-job-view" />,
}));

vi.mock("../../features/workspace/ui/LeftPane/CreateProjectDialogView", () => ({
  CreateProjectDialogView: () => null,
}));

vi.mock("../../features/workspace/ui/LeftPane/LeftPaneView", () => ({
  LeftPaneView: () => <div data-testid="left-pane-view" />,
}));

vi.mock("../../features/workspace/ui/MainPaneView", () => ({
  MainPaneView: () => <div data-testid="main-pane-view" />,
}));

vi.mock("../../features/workspace/ui/OnboardingView", () => ({
  OnboardingView: () => <div data-testid="onboarding-view" />,
}));

vi.mock("../../features/workspace/ui/WorkspaceLifecycleNoticeView", () => ({
  WorkspaceLifecycleNoticeView: () => null,
}));

vi.mock("../../features/terminal/runtime/terminalRecovery", () => ({
  TerminalRecoveryCoordinator: vi.fn(
    class {
      restoreTerminalTabsFromDaemon = terminalRecoveryMocks.restoreTerminalTabsFromDaemon;
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
      organizations: [
        { id: "org-1", name: "Org 1" },
        { id: "org-2", name: "Org 2" },
      ],
      selectedOrganizationId: "org-1",
    });
    tabStore.setState({ tabs: [], selectedTabId: null });
    workspaceStore.setState({
      displayProjectIds: [],
      gitRefreshVersionByWorktreePath: {},
      isProjectsLoaded: false,
      lastUsedExternalAppId: null,
      projects: [],
      workspaces: [],
    });
    projectStore.setState({ projects: [] });
    workbenchNavigationStore.getState().closeOverlayPanel();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function setWorkspaceProjectsLoaded() {
    workspaceStore.setState({
      isProjectsLoaded: true,
      projects: [{ id: "project-1", name: "Project 1" }],
    });
    projectStore.setState({ projects: [{ id: "project-1", name: "Project 1" }] });
  }

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

  it("selects the workspace restored from daemon terminal recovery", async () => {
    terminalRecoveryMocks.restoreTerminalTabsFromDaemon.mockResolvedValueOnce("workspace-2");

    render(
      <MemoryRouter>
        <WorkspaceView />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(commandMocks.loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
      expect(terminalRecoveryMocks.restoreTerminalTabsFromDaemon).toHaveBeenCalledTimes(1);
      expect(commandMocks.activateWorkspace).toHaveBeenCalledWith({ workspaceId: "workspace-2" });
    });
  });

  it("re-runs daemon terminal recovery when the selected organization changes", async () => {
    render(
      <MemoryRouter>
        <WorkspaceView />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(terminalRecoveryMocks.restoreTerminalTabsFromDaemon).toHaveBeenCalledTimes(1);
      expect(terminalRecoveryMocks.startPersistingTerminalTabs).toHaveBeenCalledTimes(1);
    });

    sessionStore.getState().setSessionData({
      currentUser: null,
      organizations: [{ id: "org-2", name: "Org 2" }],
      selectedOrganizationId: "org-2",
    });

    await waitFor(() => {
      expect(commandMocks.loadWorkspaceSnapshot).toHaveBeenCalledTimes(2);
      expect(terminalRecoveryMocks.restoreTerminalTabsFromDaemon).toHaveBeenCalledTimes(2);
      expect(terminalRecoveryMocks.startPersistingTerminalTabs).toHaveBeenCalledTimes(2);
    });
  });

  it("returns from the overview overlay to the workspace pane on organization switch", async () => {
    setWorkspaceProjectsLoaded();
    workbenchNavigationStore.getState().setOverlayPanel("overview");

    render(
      <MemoryRouter>
        <WorkspaceView />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("overview-view")).toBeTruthy();

    await waitFor(() => {
      expect(commandMocks.loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await switchOrganization("org-2");
    });

    await waitFor(() => {
      expect(screen.getByTestId("main-pane-view")).toBeTruthy();
      expect(screen.queryByTestId("overview-view")).toBeNull();
      expect(commandMocks.loadWorkspaceSnapshot).toHaveBeenCalledTimes(2);
    });
  });

  it("returns from the scheduled job overlay to the workspace pane on organization switch", async () => {
    setWorkspaceProjectsLoaded();
    workbenchNavigationStore.getState().setOverlayPanel("scheduledJob");

    render(
      <MemoryRouter>
        <WorkspaceView />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("scheduled-job-view")).toBeTruthy();

    await waitFor(() => {
      expect(commandMocks.loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await switchOrganization("org-2");
    });

    await waitFor(() => {
      expect(screen.getByTestId("main-pane-view")).toBeTruthy();
      expect(screen.queryByTestId("scheduled-job-view")).toBeNull();
      expect(commandMocks.loadWorkspaceSnapshot).toHaveBeenCalledTimes(2);
    });
  });

  it("renders nothing while projects have not yet loaded", () => {
    // isProjectsLoaded starts false — snapshot not yet fetched
    const { container } = render(
      <MemoryRouter>
        <WorkspaceView />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("onboarding-view")).toBeNull();
    expect(screen.queryByTestId("split-pane-layout")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("renders onboarding view when projects are loaded but empty", () => {
    workspaceStore.setState({ isProjectsLoaded: true, projects: [] });
    projectStore.setState({ projects: [] });

    render(
      <MemoryRouter>
        <WorkspaceView />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("onboarding-view")).toBeTruthy();
    expect(screen.queryByTestId("split-pane-layout")).toBeNull();
  });
});
