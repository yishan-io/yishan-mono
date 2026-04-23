import { Box } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { THREE_COL_GAP_PX, THREE_COL_SPLITTER_PX, ThreeColumnLayout } from "../components/ThreeColumnLayout";
import { useCommands } from "../hooks/useCommands";
import { WorkspacePaneVisibilityProvider, useWorkspacePaneVisibility } from "../hooks/useWorkspacePaneVisibility";
import { layoutStore } from "../store/layoutStore";
import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";
import { CreateProjectDialogView } from "./workspace/LeftPane/CreateProjectDialogView";
import { LeftPaneView } from "./workspace/LeftPane/LeftPaneView";
import { MainPaneView } from "./workspace/MainPaneView";
import { RightPaneView } from "./workspace/RightPane/RightPaneView";
import { WorkspaceLifecycleNoticeView } from "./workspace/WorkspaceLifecycleNoticeView";
import { TerminalRecoveryCoordinator } from "./workspace/terminalRecovery";

const LEFT_MIN_WIDTH = 240;
const RIGHT_MIN_WIDTH = 280;
const MAIN_MIN_WIDTH = 520;
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getSplitterPx(): number {
  return typeof THREE_COL_SPLITTER_PX === "number"
    ? THREE_COL_SPLITTER_PX
    : Number.parseFloat(THREE_COL_SPLITTER_PX) || 1;
}

function getLayoutOverhead(hasLeft: boolean, hasRight: boolean): number {
  const splitterPx = getSplitterPx();
  const items = 1 + (hasLeft ? 2 : 0) + (hasRight ? 2 : 0);
  const gaps = Math.max(0, items - 1) * THREE_COL_GAP_PX;
  const splitters = (hasLeft ? splitterPx : 0) + (hasRight ? splitterPx : 0);
  return gaps + splitters;
}

/** Renders the workspace dashboard and tracks notification/running-task state for pane indicators. */
export function WorkspaceView() {
  const { t } = useTranslation();
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(1400);
  const [isCreateRepoOpen, setIsCreateRepoOpen] = useState(false);
  const paneVisibility = useWorkspacePaneVisibility();
  const leftWidth = layoutStore((state) => state.leftWidth);
  const rightWidth = layoutStore((state) => state.rightWidth);
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
  const { setLeftWidth, setRightWidth, setSelectedWorkspaceId, loadWorkspaceFromBackend, refreshWorkspaceGitChanges } =
    useCommands();
  const [terminalRecoveryCoordinator] = useState(() => new TerminalRecoveryCoordinator());
  const { leftCollapsed, rightCollapsed, onToggleLeftPane, onToggleRightPane } = paneVisibility;

  useEffect(() => {
    let disposed = false;
    let unsubscribePersist: (() => void) | undefined;

    const loadAndRestore = async () => {
      await loadWorkspaceFromBackend();
      if (disposed) {
        return;
      }

      const restoredWorkspaceId = terminalRecoveryCoordinator.restoreTerminalTabsFromRegistry();
      if (restoredWorkspaceId) {
        const currentSelectedWorkspaceId = workspaceStore.getState().selectedWorkspaceId;
        if (restoredWorkspaceId !== currentSelectedWorkspaceId) {
          setSelectedWorkspaceId(restoredWorkspaceId);
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
  }, [loadWorkspaceFromBackend, setSelectedWorkspaceId, terminalRecoveryCoordinator]);

  useEffect(() => {
    const root = layoutRef.current;
    if (!root) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      if (!entry) {
        return;
      }
      setContainerWidth(Math.max(0, entry.contentRect.width));
    });

    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, []);

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
        await refreshWorkspaceGitChanges(selectedWorkspaceId, selectedWorkspaceWorktreePath);
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
  }, [refreshWorkspaceGitChanges, selectedWorkspaceId, selectedWorkspaceWorktreePath, workspaceGitRefreshVersion]);

  const maxLeftWidth = Math.max(
    LEFT_MIN_WIDTH,
    containerWidth - getLayoutOverhead(true, !rightCollapsed) - MAIN_MIN_WIDTH - (rightCollapsed ? 0 : rightWidth),
  );
  const maxRightWidth = Math.max(
    RIGHT_MIN_WIDTH,
    containerWidth - getLayoutOverhead(!leftCollapsed, true) - MAIN_MIN_WIDTH - (leftCollapsed ? 0 : leftWidth),
  );

  const resolvedLeftWidth = clamp(leftWidth, LEFT_MIN_WIDTH, maxLeftWidth);
  const resolvedRightWidth = clamp(rightWidth, RIGHT_MIN_WIDTH, maxRightWidth);

  const resizeLeftStart = (clientXStart: number) => {
    if (leftCollapsed) {
      return;
    }

    const startWidth = resolvedLeftWidth;
    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - clientXStart;
      const nextWidth = clamp(startWidth + delta, LEFT_MIN_WIDTH, maxLeftWidth);
      setLeftWidth(nextWidth);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const resizeRightStart = (clientXStart: number) => {
    if (rightCollapsed) {
      return;
    }

    const startWidth = resolvedRightWidth;
    const onMouseMove = (event: MouseEvent) => {
      const delta = clientXStart - event.clientX;
      const nextWidth = clamp(startWidth + delta, RIGHT_MIN_WIDTH, maxRightWidth);
      setRightWidth(nextWidth);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <WorkspacePaneVisibilityProvider value={paneVisibility}>
      <ThreeColumnLayout
        layoutRef={layoutRef}
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        leftResizeLabel={t("layout.resize.left")}
        rightResizeLabel={t("layout.resize.right")}
        onResizeLeftStart={resizeLeftStart}
        onResizeRightStart={resizeRightStart}
        left={
          <Box sx={{ width: resolvedLeftWidth, minWidth: resolvedLeftWidth, height: "100%" }}>
            <LeftPaneView
              onCreateRepository={() => {
                setIsCreateRepoOpen(true);
              }}
              onToggleLeftPane={onToggleLeftPane}
            />
          </Box>
        }
        main={<MainPaneView />}
        right={
          <Box sx={{ width: resolvedRightWidth, minWidth: resolvedRightWidth, height: "100%" }}>
            <RightPaneView onToggleRightPane={onToggleRightPane} />
          </Box>
        }
      />
      <CreateProjectDialogView open={isCreateRepoOpen} onClose={() => setIsCreateRepoOpen(false)} />
      <WorkspaceLifecycleNoticeView />
    </WorkspacePaneVisibilityProvider>
  );
}
