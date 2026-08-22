import { Box } from "@mui/material";
import { AgentChatRecoveryCoordinator, listActivePiSessions } from "@renderer/domains/agent";
import { SYSTEM_FILE_MANAGER_APP_ID, openEntryInExternalApp } from "@renderer/domains/files";
import { gitProjectionStore, refreshWorkspaceGitChanges, useAllWorkspacesGitSync } from "@renderer/domains/git";
import { refreshActiveLocalTaskCount, selectLocalTaskWorkspace } from "@renderer/domains/local-task";
import { OverviewView } from "@renderer/domains/overview";
import { CreateProjectDialogView, projectStore } from "@renderer/domains/project";

import { ScheduledJobView } from "@renderer/domains/scheduled-job";
import { sessionStore } from "@renderer/domains/session";
import { TerminalRecoveryCoordinator } from "@renderer/domains/terminal";
import { listTerminalSessions, setActiveWorkspace } from "@renderer/domains/terminal";
import {
  SplitPaneLayout,
  WorkspacePaneVisibilityProvider,
  activateWorkspace,
  layoutStore,
  openTab,
  resizeLeftPane,
  setSelectedTab,
  tabStore,
  useWorkspacePaneVisibility,
  workbenchNavigationStore,
} from "@renderer/domains/workbench";
import {
  WorkspaceLifecycleNoticeView,
  deleteSelectedFileTreeEntry,
  toggleLeftPaneVisibility,
  toggleRightPaneVisibility,
  undoFileTreeOperation,
  workspaceStore,
} from "@renderer/domains/workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { closeTabWithCleanup } from "../../app/commands/tabCloseHandler";
import { loadWorkspaceSnapshot } from "../../app/commands/workspaceSnapshotFlow";
import { useSelectedWorkspaceWithProject } from "../../app/selectors";
import { LeftPaneView } from "../features/main-workspace-shell/LeftPaneView";
import { MainPaneView } from "../features/main-workspace-shell/MainPaneView";
import { OnboardingView } from "./OnboardingView";
import {
  type WorkspaceViewCommands,
  useElementWidthObserver,
  useWorkspaceAppActions,
  useWorkspaceBootstrap,
  useWorkspaceGitRefreshQueue,
} from "./workspaceHooks";

const LEFT_MIN_WIDTH = 240;
const MAIN_MIN_WIDTH = 520;
const SEPARATOR_PX = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
  const isProjectsLoaded = projectStore((state) => state.isProjectsLoaded);
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
  // merge). The action members are stable module-level functions.
  const cmd: WorkspaceViewCommands = useMemo(
    () => ({
      activateWorkspace,
      toggleLeftPaneVisibility,
      toggleRightPaneVisibility,
      deleteSelectedFileTreeEntry,
      undoFileTreeOperation,
      selectTab: setSelectedTab,
      closeTab: closeTabWithCleanup,
      openTab,
      listActivePiSessions,
      listTerminalSessions,
      setActiveWorkspace,
      openEntryInExternalApp,
      refreshWorkspaceGitChanges,
      refreshActiveLocalTaskCount,
      selectLocalTaskWorkspace,
      loadWorkspaceSnapshot,
    }),
    [],
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
    // fire-and-forget: command state owns load failures and stale-request protection.
    void cmd.selectLocalTaskWorkspace(selectedWorkspaceId || null);
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
