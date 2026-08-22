import { Box } from "@mui/material";
import { gitProjectionStore } from "@renderer/domains/git";
import { localTaskStore } from "@renderer/domains/local-task";
import {
  ColumnSeparator,
  DEFAULT_RIGHT_PANE_TAB,
  RightPaneTabBar,
  layoutStore,
  resizeRightPane,
  setRightPaneTab,
  useWorkspacePaneVisibilityContext,
} from "@renderer/domains/workbench";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { RightPaneView } from "./RightPaneView";
import { useMainPaneRightTabs } from "./useMainPaneRightTabs";

const RIGHT_MIN_WIDTH = 280;
const RIGHT_MAX_WIDTH = 800;

type MainPaneRightAreaProps = {
  selectedWorkspaceId: string;
  gitCapable: boolean;
  isErrorWorkspace: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Renders and resizes the workspace right pane and its registered tabs. */
export function MainPaneRightArea({ selectedWorkspaceId, gitCapable, isErrorWorkspace }: MainPaneRightAreaProps) {
  const { t } = useTranslation();
  const { rightCollapsed, onToggleRightPane, showRightPane } = useWorkspacePaneVisibilityContext();
  const rightWidth = layoutStore((state) => state.rightWidth);
  const activeRightPaneTab = layoutStore(
    (state) => state.rightPaneTabByWorkspaceId[selectedWorkspaceId] ?? DEFAULT_RIGHT_PANE_TAB,
  );
  const changesCount = gitProjectionStore((state) => state.gitChangesCountByWorkspaceId[selectedWorkspaceId] ?? 0);
  const workspaceTaskCount = localTaskStore((state) => state.workspaceActiveTaskCount);
  const rightPaneTabs = useMainPaneRightTabs({ gitCapable, changesCount, workspaceTaskCount });
  const rightDragRef = useRef({ startX: 0, startWidth: 0 });
  const resizeRightStart = useCallback(
    (clientXStart: number) => {
      if (rightCollapsed) return;
      rightDragRef.current = { startX: clientXStart, startWidth: rightWidth };
    },
    [rightCollapsed, rightWidth],
  );
  const resizeRightMove = useCallback((clientX: number) => {
    const { startX, startWidth } = rightDragRef.current;
    resizeRightPane(clamp(startWidth + startX - clientX, RIGHT_MIN_WIDTH, RIGHT_MAX_WIDTH));
  }, []);

  return (
    <>
      <Box sx={{ display: rightCollapsed || isErrorWorkspace ? "none" : "block" }}>
        <ColumnSeparator
          orientation="horizontal"
          ariaLabel={t("layout.resize.right")}
          onResizeStart={resizeRightStart}
          onResizeMove={resizeRightMove}
        />
      </Box>
      <Box
        sx={{
          display: rightCollapsed || isErrorWorkspace ? "none" : undefined,
          width: rightWidth,
          minWidth: RIGHT_MIN_WIDTH,
          height: "100%",
          overflow: "hidden",
        }}
      >
        <RightPaneView />
      </Box>
      {isErrorWorkspace ? null : (
        <RightPaneTabBar
          tabs={rightPaneTabs}
          activeRightPaneTab={activeRightPaneTab}
          rightCollapsed={rightCollapsed}
          onToggleRightPane={onToggleRightPane}
          showRightPane={showRightPane}
          onSelectTab={(tab) => setRightPaneTab(selectedWorkspaceId, tab)}
        />
      )}
    </>
  );
}
