import { Box } from "@mui/material";
import { useEffect, useMemo } from "react";
import { SUPPORTED_DESKTOP_AGENT_KINDS } from "../../helpers/agentSettings";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";
import { tabStore } from "../../store/tabStore";
import type { WorkspaceTab } from "../../store/types";
import { workspaceStore } from "../../store/workspaceStore";
import { DARK_SURFACE_COLORS } from "../../theme";
import { LaunchView } from "./LaunchView";
import { MainPaneTitleBarView } from "./MainPaneTitleBarView";
import { TabPanel } from "../../components/TabPanel";
import { removeWebviewsForClosedTabs } from "./browser/webviewRegistry";
import { disposeTerminalRuntimesForClosedTabs } from "./terminal/terminalRuntimeRegistry";
import { WorkspaceSplitPane } from "./WorkspaceSplitPaneView";

/** Renders the primary workspace pane with split-pane tabbed content, per-tab views, and pane visibility controls. */
export function MainPaneView() {
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const tabs = tabStore((state) => state.tabs);
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const enabledAgentKinds = useMemo(
    () => SUPPORTED_DESKTOP_AGENT_KINDS.filter((agentKind) => inUseByAgentKind[agentKind]),
    [inUseByAgentKind],
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
      <Box sx={{ flex: 1, position: "relative", overflow: "hidden" }}>
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
    </Box>
  );
}
