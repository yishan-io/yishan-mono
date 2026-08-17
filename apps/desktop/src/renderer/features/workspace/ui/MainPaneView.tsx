import { Box } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useTerminalCommands } from "../../../app/commands/useCommands";
import { ColumnSeparator } from "../../../components/ColumnSeparator";
import { TabPanel } from "../../../components/TabPanel";
import { retainOpenAgentChatComposerFocus } from "../../../events/agentChatComposerFocus";
import { useAgentKindsInUse } from "../../../features/settings/ui/hooks/useSettingsReadHooks";
import { disposeTerminalRuntimesForClosedTabs } from "../../../features/terminal";
import type { WorkspaceTab } from "../../../features/workbench/model/types";
import { setRightPaneWidth } from "../../../features/workbench/state/workbenchActions";
import { useRightPaneWidth } from "../../../features/workbench/ui/hooks/useWorkbenchLayout";
import { useWorkspaceTabs } from "../../../features/workbench/ui/hooks/useWorkbenchTabs";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";
import { useWorkspacePaneVisibilityContext } from "../../../features/workspace/ui/hooks/useWorkspacePaneVisibility";
import { SUPPORTED_DESKTOP_AGENT_KINDS } from "../../../helpers/agentSettings";
import { DARK_SURFACE_COLORS } from "../../../theme";
import { FileSearchOverlay } from "./FileSearchOverlay";
import { LaunchView } from "./LaunchView";
import { MainPaneTitleBarView } from "./MainPaneTitleBarView";
import { RightPaneTabBar } from "./RightPane/RightPaneTabBar";
import { RightPaneView } from "./RightPane/RightPaneView";
import { WorkspaceErrorStateView } from "./WorkspaceErrorStateView";
import { WorkspaceSplitPane } from "./WorkspaceSplitPaneView";
import { removeWebviewsForClosedTabs } from "./browser/webviewRegistry";

const RIGHT_MIN_WIDTH = 280;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Renders the primary workspace pane with split-pane tabbed content, per-tab views, and pane visibility controls. */
export function MainPaneView() {
  const { t } = useTranslation();
  const cmd = useTerminalCommands();
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const workspaces = workspaceStore((state) => state.workspaces) ?? [];
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const isErrorWorkspace = selectedWorkspace?.state === "error";
  const tabs = useWorkspaceTabs();
  const inUseByAgentKind = useAgentKindsInUse();
  const { rightCollapsed, onToggleRightPane, showRightPane } = useWorkspacePaneVisibilityContext();
  const rightWidth = useRightPaneWidth();
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

  const resizeRightMove = useCallback((clientX: number) => {
    const { startX, startWidth } = rightDragRef.current;
    const delta = startX - clientX;
    const nextWidth = clamp(startWidth + delta, RIGHT_MIN_WIDTH, 800);
    setRightPaneWidth(nextWidth);
  }, []);

  useEffect(() => {
    const browserTabIds = new Set(tabs.filter((tab) => tab.kind === "browser").map((tab) => tab.id));
    removeWebviewsForClosedTabs(browserTabIds);

    const terminalTabIds = new Set(tabs.filter((tab) => tab.kind === "terminal").map((tab) => tab.id));
    const agentChatTabIds = new Set(tabs.filter((tab) => tab.kind === "agent-chat").map((tab) => tab.id));
    cmd.retainOpenTerminalTabFocus(terminalTabIds);
    retainOpenAgentChatComposerFocus(agentChatTabIds);
    disposeTerminalRuntimesForClosedTabs(terminalTabIds);
  }, [cmd, tabs]);

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
          {isErrorWorkspace && selectedWorkspace ? (
            <WorkspaceErrorStateView workspace={selectedWorkspace} />
          ) : (
            <>
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
            </>
          )}
        </Box>

        {/* Right pane resize separator — hidden when collapsed or the selected workspace is broken */}
        <Box sx={{ display: rightCollapsed || isErrorWorkspace ? "none" : "block" }}>
          <ColumnSeparator
            orientation="horizontal"
            ariaLabel={t("layout.resize.right")}
            onResizeStart={resizeRightStart}
            onResizeMove={resizeRightMove}
          />
        </Box>

        {/* Right pane content — hidden when collapsed or the selected workspace is broken (kept mounted so file-tree state survives) */}
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

        {/* Vertical tab bar — hidden for broken workspaces (no tabs allowed) */}
        {isErrorWorkspace ? null : (
          <RightPaneTabBar
            rightCollapsed={rightCollapsed}
            onToggleRightPane={onToggleRightPane}
            showRightPane={showRightPane}
          />
        )}
      </Box>
      <FileSearchOverlay />
    </Box>
  );
}
