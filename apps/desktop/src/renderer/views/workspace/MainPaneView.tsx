import { Box } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ColumnSeparator } from "../../components/ColumnSeparator";
import { SUPPORTED_DESKTOP_AGENT_KINDS } from "../../helpers/agentSettings";
import { useWorkspacePaneVisibilityContext } from "../../hooks/useWorkspacePaneVisibility";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";
import { layoutStore, DEFAULT_RIGHT_WIDTH } from "../../store/settings/layoutStore";
import { tabStore } from "../../store/tabStore";
import type { WorkspaceTab } from "../../store/types";
import { workspaceStore } from "../../store/workspaceStore";
import { DARK_SURFACE_COLORS } from "../../theme";
import { LaunchView } from "./LaunchView";
import { MainPaneTitleBarView } from "./MainPaneTitleBarView";
import { TabPanel } from "../../components/TabPanel";
import { RightPaneTabBar } from "./RightPane/RightPaneTabBar";
import { RightPaneView } from "./RightPane/RightPaneView";
import { removeWebviewsForClosedTabs } from "./browser/webviewRegistry";
import { disposeTerminalRuntimesForClosedTabs } from "./terminal/terminalRuntimeRegistry";
import { WorkspaceSplitPane } from "./WorkspaceSplitPaneView";

const RIGHT_MIN_WIDTH = 280;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Renders the primary workspace pane with split-pane tabbed content, per-tab views, and pane visibility controls. */
export function MainPaneView() {
  const { t } = useTranslation();
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const tabs = tabStore((state) => state.tabs);
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const { rightCollapsed, onToggleRightPane, showRightPane } = useWorkspacePaneVisibilityContext();
  const rightWidth = layoutStore((state) => state.rightWidth);
  const enabledAgentKinds = useMemo(
    () => SUPPORTED_DESKTOP_AGENT_KINDS.filter((agentKind) => inUseByAgentKind[agentKind]),
    [inUseByAgentKind],
  );

  // ── right-pane resize ────────────────────────────────────────────────────
  const rightDragRef = useRef({ startX: 0, startWidth: 0 });

  const resizeRightStart = useCallback(
    (clientXStart: number) => {
      if (rightCollapsed) return;
      rightDragRef.current = { startX: clientXStart, startWidth: rightWidth };
    },
    [rightCollapsed, rightWidth],
  );

  const resizeRightMove = useCallback(
    (clientX: number) => {
      const { startX, startWidth } = rightDragRef.current;
      const delta = startX - clientX;
      const nextWidth = clamp(startWidth + delta, RIGHT_MIN_WIDTH, 800);
      layoutStore.getState().setRightPaneWidth(nextWidth);
    },
    [],
  );

  useEffect(() => {
    const browserTabIds = new Set(tabs.filter((tab) => tab.kind === "browser").map((tab) => tab.id));
    removeWebviewsForClosedTabs(browserTabIds);

    const terminalTabIds = new Set(tabs.filter((tab) => tab.kind === "terminal").map((tab) => tab.id));
    disposeTerminalRuntimesForClosedTabs(terminalTabIds);
  }, [tabs]);

  const workspaceIdsWithTabs = useMemo(() => {
    const ids = new Set<string>();
    for (const tab of tabs) {
      ids.add(tab.workspaceId);
    }
    return ids;
  }, [tabs]);

  const tabsByWorkspaceId = useMemo(() => {
    const map = new Map<string, WorkspaceTab[]>();
    for (const tab of tabs) {
      let list = map.get(tab.workspaceId);
      if (!list) {
        list = [];
        map.set(tab.workspaceId, list);
      }
      list.push(tab);
    }
    return map;
  }, [tabs]);

  const hasSelectedWorkspaceTabs = workspaceIdsWithTabs.has(selectedWorkspaceId);

  return (
    <Box
      data-testid="dashboard-main"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: (theme) =>
          theme.palette.mode === "dark" ? DARK_SURFACE_COLORS.mainPane : theme.palette.background.default,
      }}
    >
      <MainPaneTitleBarView />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
        {/* Main content area */}
        <Box sx={{ flex: 1, position: "relative", overflow: "hidden", minWidth: 0 }}>
          {Array.from(workspaceIdsWithTabs).map((wsId) => (
            <Box
              key={wsId}
              sx={{
                position: "absolute",
                inset: 0,
                display: wsId === selectedWorkspaceId ? "flex" : "none",
                flexDirection: "column",
              }}
            >
              <WorkspaceSplitPane
                workspaceId={wsId}
                isActive={wsId === selectedWorkspaceId}
                workspaceTabs={tabsByWorkspaceId.get(wsId) ?? []}
              />
            </Box>
          ))}
          {!hasSelectedWorkspaceTabs && (
            <TabPanel active>
              <LaunchView workspaceId={selectedWorkspaceId} enabledAgentKinds={enabledAgentKinds} />
            </TabPanel>
          )}
        </Box>

        {/* Right pane resize separator — hidden when collapsed */}
        {!rightCollapsed && (
          <ColumnSeparator
            orientation="horizontal"
            ariaLabel={t("layout.resize.right")}
            onResizeStart={resizeRightStart}
            onResizeMove={resizeRightMove}
          />
        )}

        {/* Right pane content — hidden when collapsed */}
        {!rightCollapsed && (
          <Box sx={{ width: rightWidth, minWidth: RIGHT_MIN_WIDTH, height: "100%", overflow: "hidden" }}>
            <RightPaneView />
          </Box>
        )}

        {/* Vertical tab bar — always visible on far right */}
        <RightPaneTabBar
          rightCollapsed={rightCollapsed}
          onToggleRightPane={onToggleRightPane}
          showRightPane={showRightPane}
        />
      </Box>
    </Box>
  );
}
