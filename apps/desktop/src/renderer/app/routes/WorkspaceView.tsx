import { Box } from "@mui/material";
import { gitProjectionStore } from "@renderer/features/git";
import { CreateProjectDialogView } from "@renderer/features/project";
import { workbenchNavigationStore } from "@renderer/features/workbench";
import { resizeLeftPane } from "@renderer/features/workbench";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ACTIONS } from "../../../shared/contracts/actions";
import { SYSTEM_FILE_MANAGER_APP_ID } from "../../../shared/contracts/externalApps";
import {
  type AgentCommandSurface,
  type FileCommandSurface,
  type GitCommandSurface,
  type ProjectCommandSurface,
  type TerminalCommandSurface,
  type WorkbenchCommandSurface,
  type WorkspaceCommandSurface,
  useAgentCommands,
  useFileCommands,
  useGitCommands,
  useProjectCommands,
  useTerminalCommands,
  useWorkbenchCommands,
  useWorkspaceCommands,
} from "../../app/commands/useCommands";
import { useSelectedWorkspaceWithProject } from "../../app/selectors";
import { popupStore } from "../../app/state/popupStore";
import { SplitPaneLayout } from "../../components/SplitPaneLayout";
import { subscribeAppActionEvent } from "../../events";
import { AgentChatRecoveryCoordinator } from "../../features/agent/runtime/agentChatRecovery";
import { OverviewView } from "../../features/overview/ui/OverviewView";
import { projectStore } from "../../features/project/state/projectStore";
import { ScheduledJobView } from "../../features/scheduled-job/ui/ScheduledJobView";
import { sessionStore } from "../../features/session/state/sessionStore";
import { TerminalRecoveryCoordinator } from "../../features/terminal/runtime/terminalRecovery";
import { layoutStore } from "../../features/workbench/state/layoutStore";
import { tabStore } from "../../features/workbench/state/tabStore";
import { resolveWorkspaceProjectId } from "../../features/workspace/model/workspaceTypes";
import { workspaceStore } from "../../features/workspace/state/workspaceStore";
import { LeftPaneView } from "../../features/workspace/ui/LeftPane/LeftPaneView";
import { MainPaneView } from "../../features/workspace/ui/MainPaneView";
import { OnboardingView } from "../../features/workspace/ui/OnboardingView";
import { WorkspaceLifecycleNoticeView } from "../../features/workspace/ui/WorkspaceLifecycleNoticeView";
import { useAllWorkspacesGitSync } from "../../features/workspace/ui/hooks/useAllWorkspacesGitSync";
import {
  WorkspacePaneVisibilityProvider,
  useWorkspacePaneVisibility,
} from "../../features/workspace/ui/hooks/useWorkspacePaneVisibility";
import { parseWorkspaceSessionNavigationPath } from "../../navigation/workspaceNavigation";
import { isEditableActiveElement } from "../../shortcuts/editableTarget";

const LEFT_MIN_WIDTH = 240;
const MAIN_MIN_WIDTH = 520;
const SEPARATOR_PX = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type WorkspaceViewCommands = WorkspaceCommandSurface &
  WorkbenchCommandSurface &
  AgentCommandSurface &
  TerminalCommandSurface &
  ProjectCommandSurface &
  FileCommandSurface &
  GitCommandSurface;

/** Subscribes global app actions and routes them to workspace-level commands. */
function useWorkspaceAppActions(input: { cmd: WorkspaceViewCommands; navigate: ReturnType<typeof useNavigate> }) {
  const { cmd, navigate } = input;
  const location = useLocation();
  const isWorkspaceRouteRef = useRef(location.pathname === "/");
  isWorkspaceRouteRef.current = location.pathname === "/";

  useEffect(() => {
    return subscribeAppActionEvent((payload) => {
      if (payload.action !== ACTIONS.NAVIGATE && popupStore.getState().isPopupOpen) {
        return;
      }

      if (payload.action !== ACTIONS.NAVIGATE && !isWorkspaceRouteRef.current) {
        return;
      }

      if (payload.action === ACTIONS.NAVIGATE) {
        const targetPath = payload.path.trim();
        if (!targetPath) {
          return;
        }
        const { workspaceId, sessionId, tabId } = parseWorkspaceSessionNavigationPath(targetPath);
        if (workspaceId) {
          const storeState = workspaceStore.getState();
          const workspace = storeState.workspaces.find((item) => item.id === workspaceId);
          cmd.activateWorkspace({
            workspaceId,
            projectId: workspace ? resolveWorkspaceProjectId(workspace) : undefined,
          });

          if (tabId) {
            const tab = tabStore.getState().tabs.find((item) => item.workspaceId === workspaceId && item.id === tabId);
            if (tab) {
              cmd.selectTab(tab.id);
            }
          }
        }

        navigate(targetPath);
        return;
      }

      if (payload.action === ACTIONS.CLOSE_TAB) {
        const selectedTabId = tabStore.getState().selectedTabId;
        if (selectedTabId) {
          cmd.closeTab(selectedTabId);
        }
        return;
      }

      if (payload.action === ACTIONS.OPEN_TERMINAL_TAB) {
        const workspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
        if (!workspaceId) {
          return;
        }

        cmd.openTab({ workspaceId, kind: "terminal", title: "Terminal" });
        return;
      }

      if (payload.action === ACTIONS.OPEN_BROWSER_TAB) {
        const workspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
        if (!workspaceId) {
          return;
        }

        cmd.openTab({ workspaceId, kind: "browser", url: "" });
        return;
      }

      if (payload.action === ACTIONS.OPEN_AGENT_CHAT_TAB) {
        const workspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
        const selectedWorkspace = workspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
        if (!workspaceId) {
          return;
        }

        cmd.openTab({
          workspaceId,
          kind: "agent-chat",
          title: "Agent Chat",
          cwd: selectedWorkspace?.worktreePath ?? undefined,
        });
        return;
      }

      if (payload.action === ACTIONS.TOGGLE_LEFT_PANE) {
        cmd.toggleLeftPaneVisibility();
        return;
      }

      if (payload.action === ACTIONS.TOGGLE_RIGHT_PANE) {
        cmd.toggleRightPaneVisibility();
        return;
      }

      if (payload.action === ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP) {
        const selectedWorkspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
        if (!selectedWorkspaceId) {
          return;
        }
        const selectedWorkspace = workspaceStore
          .getState()
          .workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
        if (!selectedWorkspace?.worktreePath) {
          return;
        }

        void cmd.openEntryInExternalApp({
          workspaceWorktreePath: selectedWorkspace.worktreePath,
          appId: projectStore.getState().lastUsedExternalAppId ?? SYSTEM_FILE_MANAGER_APP_ID,
        });
        return;
      }

      if (isEditableActiveElement()) {
        return;
      }

      if (payload.action === ACTIONS.FILE_DELETE) {
        cmd.deleteSelectedFileTreeEntry();
        return;
      }

      if (payload.action === ACTIONS.FILE_UNDO) {
        cmd.undoFileTreeOperation();
        return;
      }
    });
  }, [cmd, navigate]);
}

/** Loads workspace data and restores terminal tabs persisted from previous sessions. */
function useWorkspaceBootstrap(input: {
  cmd: WorkspaceViewCommands;
  terminalRecoveryCoordinator: TerminalRecoveryCoordinator;
  agentChatRecoveryCoordinator: AgentChatRecoveryCoordinator;
  selectedOrganizationId: string | undefined;
}) {
  const { cmd, terminalRecoveryCoordinator, agentChatRecoveryCoordinator, selectedOrganizationId } = input;

  useEffect(() => {
    if (!selectedOrganizationId?.trim()) {
      return;
    }

    let disposed = false;
    let unsubscribeTerminalPersist: (() => void) | undefined;
    let unsubscribeAgentChatPersist: (() => void) | undefined;

    const loadWorkspaceData = async () => {
      await cmd.loadWorkspaceSnapshot();
      if (disposed) {
        return;
      }

      const restoredTerminalWorkspaceId = await terminalRecoveryCoordinator.restoreTerminalTabsFromDaemon({
        listTerminalSessions: () => cmd.listTerminalSessions({ includeExited: false }),
      });
      const restoredAgentChatResult = await agentChatRecoveryCoordinator.restoreAgentChatTabsFromDaemon({
        listActivePiSessions: () => cmd.listActivePiSessions(),
      });
      const restoredWorkspaceId =
        restoredAgentChatResult.selectedWorkspaceId ??
        restoredTerminalWorkspaceId ??
        restoredAgentChatResult.fallbackWorkspaceId;
      if (restoredWorkspaceId && restoredWorkspaceId !== workbenchNavigationStore.getState().activeWorkspaceId) {
        cmd.activateWorkspace({ workspaceId: restoredWorkspaceId });
      }

      if (!disposed) {
        unsubscribeTerminalPersist = terminalRecoveryCoordinator.startPersistingTerminalTabs();
        unsubscribeAgentChatPersist = agentChatRecoveryCoordinator.startPersistingAgentChatTabs();
      }
    };

    void loadWorkspaceData();

    return () => {
      disposed = true;
      unsubscribeTerminalPersist?.();
      unsubscribeAgentChatPersist?.();
    };
  }, [cmd, selectedOrganizationId, terminalRecoveryCoordinator, agentChatRecoveryCoordinator]);
}

/** Observes one container element and reports its width whenever it changes. */
function useElementWidthObserver(input: {
  elementRef: RefObject<HTMLDivElement | null>;
  onWidthChange: (width: number) => void;
}) {
  const { elementRef, onWidthChange } = input;

  useEffect(() => {
    const root = elementRef.current;
    if (!root) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      if (!entry) {
        return;
      }
      onWidthChange(Math.max(0, entry.contentRect.width));
    });

    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, [elementRef, onWidthChange]);
}

/** Refreshes selected workspace git changes with queued re-run protection. */
function useWorkspaceGitRefreshQueue(input: {
  cmd: WorkspaceViewCommands;
  selectedWorkspaceId: string;
  selectedWorkspaceWorktreePath: string | undefined;
  workspaceGitRefreshVersion: number;
}) {
  const { cmd, selectedWorkspaceId, selectedWorkspaceWorktreePath, workspaceGitRefreshVersion } = input;

  useEffect(() => {
    if (!selectedWorkspaceId || !selectedWorkspaceWorktreePath) {
      return;
    }

    void workspaceGitRefreshVersion;

    let cancelled = false;
    let inFlight = false;
    let queued = false;

    const refreshWorkspaceGitChangesNow = async () => {
      if (cancelled || inFlight) {
        queued = true;
        return;
      }

      inFlight = true;

      try {
        await cmd.refreshWorkspaceGitChanges(selectedWorkspaceId);
      } finally {
        inFlight = false;
        if (queued) {
          queued = false;
          void refreshWorkspaceGitChangesNow();
        }
      }
    };

    void refreshWorkspaceGitChangesNow();

    return () => {
      cancelled = true;
    };
  }, [cmd, selectedWorkspaceId, selectedWorkspaceWorktreePath, workspaceGitRefreshVersion]);
}

/** Renders the workspace dashboard and tracks notification/running-task state for pane indicators. */
export function WorkspaceView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(1400);
  const [isCreateRepoOpen, setIsCreateRepoOpen] = useState(false);
  const paneVisibility = useWorkspacePaneVisibility();
  const leftWidth = layoutStore((state) => state.leftWidth);
  const projects = projectStore((state) => state.projects);
  const isProjectsLoaded = workspaceStore((state) => state.isProjectsLoaded);
  const { selectedWorkspaceId, selectedWorkspace } = useSelectedWorkspaceWithProject();
  const selectedWorkspaceWorktreePath = selectedWorkspace?.worktreePath;
  const workspaceGitRefreshVersion = gitProjectionStore((state) =>
    selectedWorkspaceWorktreePath ? (state.gitRefreshVersionByWorktreePath?.[selectedWorkspaceWorktreePath] ?? 0) : 0,
  );
  const overlayPanel = workbenchNavigationStore((state) => state.overlayPanel);
  const closeOverlayPanel = workbenchNavigationStore((state) => state.closeOverlayPanel);
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  // The command surface must stay referentially stable across renders: the
  // bootstrap effect keys on `cmd`, and a fresh object every render would
  // re-trigger workspace snapshot loads (which race and skip the local-folder
  // merge). Each per-feature hook already memoizes its surface.
  const workspaceCommands = useWorkspaceCommands();
  const workbenchCommands = useWorkbenchCommands();
  const agentCommands = useAgentCommands();
  const terminalCommands = useTerminalCommands();
  const projectCommands = useProjectCommands();
  const fileCommands = useFileCommands();
  const gitCommands = useGitCommands();
  const cmd: WorkspaceViewCommands = useMemo(
    () => ({
      ...workspaceCommands,
      ...workbenchCommands,
      ...agentCommands,
      ...terminalCommands,
      ...projectCommands,
      ...fileCommands,
      ...gitCommands,
    }),
    [workspaceCommands, workbenchCommands, agentCommands, terminalCommands, projectCommands, fileCommands, gitCommands],
  );
  useAllWorkspacesGitSync();
  const [terminalRecoveryCoordinator] = useState(() => new TerminalRecoveryCoordinator(tabStore, workspaceStore));
  const [agentChatRecoveryCoordinator] = useState(() => new AgentChatRecoveryCoordinator(tabStore, workspaceStore));
  const { leftCollapsed, onToggleLeftPane } = paneVisibility;

  const handleCloseOverlayPanel = useCallback(() => {
    closeOverlayPanel();
  }, [closeOverlayPanel]);

  useWorkspaceAppActions({ cmd, navigate });
  useWorkspaceBootstrap({ cmd, terminalRecoveryCoordinator, agentChatRecoveryCoordinator, selectedOrganizationId });
  useElementWidthObserver({
    elementRef: layoutRef,
    onWidthChange: setContainerWidth,
  });
  useWorkspaceGitRefreshQueue({
    cmd,
    selectedWorkspaceId,
    selectedWorkspaceWorktreePath,
    workspaceGitRefreshVersion,
  });
  useEffect(() => {
    void cmd.setActiveWorkspace({ workspaceId: selectedWorkspaceId || undefined });
  }, [cmd, selectedWorkspaceId]);

  const leftSep = leftCollapsed ? 0 : SEPARATOR_PX;
  const maxLeftWidth = Math.max(LEFT_MIN_WIDTH, containerWidth - leftSep - MAIN_MIN_WIDTH);

  const resolvedLeftWidth = clamp(leftWidth, LEFT_MIN_WIDTH, maxLeftWidth);
  const hasProjects = projects.length > 0;

  // Ref to hold the drag origin so pointer-capture callbacks can compute deltas.
  const leftDragRef = useRef({ startX: 0, startWidth: 0 });

  const resizeLeftStart = useCallback(
    (clientXStart: number) => {
      if (leftCollapsed) return;
      leftDragRef.current = { startX: clientXStart, startWidth: resolvedLeftWidth };
    },
    [leftCollapsed, resolvedLeftWidth],
  );

  const resizeLeftMove = useCallback(
    (clientX: number) => {
      const { startX, startWidth } = leftDragRef.current;
      const delta = clientX - startX;
      const nextWidth = clamp(startWidth + delta, LEFT_MIN_WIDTH, maxLeftWidth);
      resizeLeftPane(nextWidth);
    },
    [maxLeftWidth],
  );

  if (!isProjectsLoaded) {
    return null;
  }

  if (!hasProjects) {
    return (
      <WorkspacePaneVisibilityProvider value={paneVisibility}>
        <Box sx={{ height: "100%" }}>
          <OnboardingView />
        </Box>
        <WorkspaceLifecycleNoticeView />
      </WorkspacePaneVisibilityProvider>
    );
  }

  return (
    <WorkspacePaneVisibilityProvider value={paneVisibility}>
      <SplitPaneLayout
        layoutRef={layoutRef}
        position="left"
        collapsed={leftCollapsed}
        resizeLabel={t("layout.resize.left")}
        onResizeStart={resizeLeftStart}
        onResizeMove={resizeLeftMove}
        sideContent={
          <Box sx={{ width: resolvedLeftWidth, minWidth: resolvedLeftWidth, height: "100%" }}>
            <LeftPaneView
              onCreateRepository={() => {
                setIsCreateRepoOpen(true);
              }}
              onToggleLeftPane={onToggleLeftPane}
            />
          </Box>
        }
      >
        {overlayPanel === "scheduledJob" ? (
          <ScheduledJobView onClose={handleCloseOverlayPanel} />
        ) : overlayPanel === "overview" ? (
          <OverviewView onClose={handleCloseOverlayPanel} />
        ) : (
          <MainPaneView />
        )}
      </SplitPaneLayout>
      <CreateProjectDialogView open={isCreateRepoOpen} onClose={() => setIsCreateRepoOpen(false)} />
      <WorkspaceLifecycleNoticeView />
    </WorkspacePaneVisibilityProvider>
  );
}
