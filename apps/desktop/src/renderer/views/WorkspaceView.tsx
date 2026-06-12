import { Box } from "@mui/material";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ACTIONS } from "../../shared/contracts/actions";
import { SYSTEM_FILE_MANAGER_APP_ID } from "../../shared/contracts/externalApps";
import { SplitPaneLayout } from "../components/SplitPaneLayout";
import { subscribeAppActionEvent } from "../events";
import { useAllWorkspacesGitSync } from "../hooks/useAllWorkspacesGitSync";
import { useCommands } from "../hooks/useCommands";
import { WorkspacePaneVisibilityProvider, useWorkspacePaneVisibility } from "../hooks/useWorkspacePaneVisibility";
import { parseWorkspaceSessionNavigationPath } from "../navigation/workspaceNavigation";
import { isEditableActiveElement } from "../shortcuts/editableTarget";
import { layoutStore } from "../store/settings/layoutStore";
import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";
import { workspaceUiStore } from "../store/workspaceUiStore";
import { OverviewView } from "./overview/OverviewView";
import { ScheduledJobView } from "./scheduledJob/ScheduledJobView";
import { CreateProjectDialogView } from "./workspace/LeftPane/CreateProjectDialogView";
import { LeftPaneView } from "./workspace/LeftPane/LeftPaneView";
import { MainPaneView } from "./workspace/MainPaneView";
import { OnboardingView } from "./workspace/OnboardingView";
import { WorkspaceLifecycleNoticeView } from "./workspace/WorkspaceLifecycleNoticeView";
import { TerminalRecoveryCoordinator } from "./workspace/terminal/terminalRecovery";

const LEFT_MIN_WIDTH = 240;
const MAIN_MIN_WIDTH = 520;
const SEPARATOR_PX = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type WorkspaceViewCommands = ReturnType<typeof useCommands>;

/** Subscribes global app actions and routes them to workspace-level commands. */
function useWorkspaceAppActions(input: { cmd: WorkspaceViewCommands; navigate: ReturnType<typeof useNavigate> }) {
  const { cmd, navigate } = input;
  const location = useLocation();
  const isWorkspaceRouteRef = useRef(location.pathname === "/");
  isWorkspaceRouteRef.current = location.pathname === "/";

  useEffect(() => {
    return subscribeAppActionEvent((payload) => {
      if (payload.action !== ACTIONS.NAVIGATE && layoutStore.getState().isPopupOpen) {
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
          if (workspace) {
            cmd.setSelectedRepoId(workspace.repoId);
          }
          cmd.setSelectedWorkspaceId(workspaceId);

          if (tabId) {
            const tab = tabStore.getState().tabs.find((item) => item.workspaceId === workspaceId && item.id === tabId);
            if (tab) {
              cmd.selectTab(tab.id);
            }
          } else if (sessionId) {
            const sessionTab = tabStore
              .getState()
              .tabs.find(
                (tab) => tab.workspaceId === workspaceId && tab.kind === "session" && tab.data.sessionId === sessionId,
              );
            if (sessionTab) {
              cmd.selectTab(sessionTab.id);
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
        const workspaceId = workspaceStore.getState().selectedWorkspaceId;
        if (!workspaceId) {
          return;
        }

        cmd.openTab({ workspaceId, kind: "terminal", title: "Terminal" });
        return;
      }

      if (payload.action === ACTIONS.OPEN_BROWSER_TAB) {
        const workspaceId = workspaceStore.getState().selectedWorkspaceId;
        if (!workspaceId) {
          return;
        }

        cmd.openTab({ workspaceId, kind: "browser", url: "" });
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
        const selectedWorkspaceId = workspaceStore.getState().selectedWorkspaceId;
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
          appId: workspaceStore.getState().lastUsedExternalAppId ?? SYSTEM_FILE_MANAGER_APP_ID,
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
}) {
  const { cmd, terminalRecoveryCoordinator } = input;

  useEffect(() => {
    let disposed = false;
    let unsubscribePersist: (() => void) | undefined;

    const loadAndRestore = async () => {
      await cmd.loadWorkspaceFromBackend();
      if (disposed) {
        return;
      }

      const restoredWorkspaceId = terminalRecoveryCoordinator.restoreTerminalTabsFromRegistry();
      if (restoredWorkspaceId) {
        const currentSelectedWorkspaceId = workspaceStore.getState().selectedWorkspaceId;
        if (restoredWorkspaceId !== currentSelectedWorkspaceId) {
          cmd.setSelectedWorkspaceId(restoredWorkspaceId);
        }
      }
      if (disposed) {
        return;
      }
      unsubscribePersist = terminalRecoveryCoordinator.startPersistingTerminalTabs();
    };

    void loadAndRestore();

    return () => {
      disposed = true;
      unsubscribePersist?.();
    };
  }, [cmd, terminalRecoveryCoordinator]);
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
  const projects = workspaceStore((state) => state.projects);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const selectedWorkspaceWorktreePath = workspaceStore(
    (state) => state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId)?.worktreePath,
  );
  const workspaceGitRefreshVersion = workspaceStore((state) => {
    if (!selectedWorkspaceWorktreePath) {
      return 0;
    }

    return state.gitRefreshVersionByWorktreePath?.[selectedWorkspaceWorktreePath] ?? 0;
  });
  const overlayPanel = workspaceUiStore((state) => state.overlayPanel);
  const closeOverlayPanel = workspaceUiStore((state) => state.closeOverlayPanel);
  const cmd = useCommands();
  useAllWorkspacesGitSync();
  const [terminalRecoveryCoordinator] = useState(() => new TerminalRecoveryCoordinator());
  const { leftCollapsed, onToggleLeftPane } = paneVisibility;

  const handleCloseOverlayPanel = useCallback(() => {
    closeOverlayPanel();
  }, [closeOverlayPanel]);

  useWorkspaceAppActions({ cmd, navigate });
  useWorkspaceBootstrap({ cmd, terminalRecoveryCoordinator });
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
      cmd.setLeftPaneWidth(nextWidth);
    },
    [cmd, maxLeftWidth],
  );

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
