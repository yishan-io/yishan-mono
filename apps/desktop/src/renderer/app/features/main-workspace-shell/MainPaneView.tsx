import { Box } from "@mui/material";
import { WorkspaceAgentChatSurface, fetchAgentSessionFilePath, findTabWithSession } from "@renderer/domains/agent";
import { AgentIcon, SessionHistoryMenu } from "@renderer/domains/agent";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  DEFAULT_AGENT_COMMANDS,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "@renderer/domains/agent";
import { formatAgentSessionTitle } from "@renderer/domains/agent";
import { agentSettingsStore } from "@renderer/domains/agent";
import { removeWebviewsForClosedTabs } from "@renderer/domains/browser";
import { FileSearchOverlay, getFileTreeIcon } from "@renderer/domains/files";
import {
  createNewWhiteboard,
  markFileTabSaved,
  openEntryInExternalApp,
  readFile,
  refreshFileTabFromDisk,
  renameEntry,
  updateFileTabContent,
  writeFile,
} from "@renderer/domains/files";
import { readBranchComparisonDiff, readCommitDiff, readDiff, refreshDiffTabContent } from "@renderer/domains/git";

import { projectStore, supportsGitFeatures } from "@renderer/domains/project";
import {
  disposeTerminalRuntimesForClosedTabs,
  forceFitTerminalRuntimes,
  retainOpenTerminalTabFocus,
} from "@renderer/domains/terminal";
import { WorkspaceSplitPane, tabStore, workbenchNavigationStore } from "@renderer/domains/workbench";
import type { WorkbenchTab } from "@renderer/domains/workbench";
import { TabPanel } from "@renderer/domains/workbench";
import { openTabWithContentSeed, retainOpenTabFocus } from "@renderer/domains/workbench";
import { workspaceStore } from "@renderer/domains/workspace";
import { WorkspaceErrorStateView } from "@renderer/domains/workspace";
import { isFolderWorkspace } from "@renderer/domains/workspace";
import { DARK_SURFACE_COLORS } from "@renderer/ui/theme";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_FILE_MANAGER_APP_ID, findExternalAppPreset } from "../../../../shared/contracts/externalApps";
import {
  closeAllTabsWithCleanup,
  closeOtherTabsWithCleanup,
  closeTabWithCleanup,
} from "../../commands/tabCloseHandler";
import { useSelectedWorkspaceWithProject } from "../../selectors";
import { LaunchView } from "../launch/LaunchView";
import { useTabContentRenderer } from "../tab-content/useTabContentRenderer";
import { MainPaneTitleBarView } from "../title-bar/MainPaneTitleBarView";
import { MainPaneRightArea } from "./MainPaneRightArea";

/** Renders the primary workspace pane with split-pane tabbed content, per-tab views, and pane visibility controls. */
export function MainPaneView() {
  const selectedWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const workspaces = workspaceStore((state) => state.workspaces) ?? [];
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const { selectedProject } = useSelectedWorkspaceWithProject();
  const isErrorWorkspace = selectedWorkspace?.state === "error";
  const tabs = tabStore((state) => state.tabs);
  const selectedTabId = tabStore((state) => state.selectedTabId);
  const mergedCmd = useMemo(
    () => ({
      openTab: openTabWithContentSeed,
      openEntryInExternalApp,
      markFileTabSaved,
      updateFileTabContent,
      writeFile,
      createNewWhiteboard,
      renameEntry,
      readFile,
      refreshFileTabFromDisk,
    }),
    [],
  );
  const lastUsedExternalAppId = projectStore((state) => state.lastUsedExternalAppId);
  const lastUsedExternalAppPreset = lastUsedExternalAppId ? findExternalAppPreset(lastUsedExternalAppId) : null;
  const externalAppLabel = lastUsedExternalAppPreset
    ? `Open in ${lastUsedExternalAppPreset.label}`
    : "Open in external app";
  const [focusContentRequestKey, setFocusContentRequestKey] = useState(0);
  const renderTabContent = useTabContentRenderer({
    workspace: selectedWorkspace,
    externalAppLabel,
    focusContentRequestKey,
    cmd: mergedCmd,
    onOpenExternalApp: async (filePath) => {
      const workspaceWorktreePath = selectedWorkspace?.worktreePath;
      if (!workspaceWorktreePath) return;
      try {
        await mergedCmd.openEntryInExternalApp({
          workspaceWorktreePath,
          appId: lastUsedExternalAppId ?? SYSTEM_FILE_MANAGER_APP_ID,
          relativePath: filePath,
        });
      } catch (error) {
        console.error("Failed to open workspace file externally", error);
      }
    },
  });
  const renderAgentChatSurface = useCallback(
    (input: {
      tab: Extract<WorkbenchTab, { kind: "agent-chat" }>;
      isWorkspaceActive: boolean;
      isDraggingSplit: boolean;
      isSelected: boolean;
      isInActivePane: boolean;
      rect: { left: number; top: number; width: number; height: number } | null;
      paneId: string;
      lastKnownRectByTabIdRef: React.MutableRefObject<
        Record<string, { left: number; top: number; width: number; height: number }>
      >;
      handleFocusPane: (paneId: string) => void;
    }) => {
      return <WorkspaceAgentChatSurface key={input.tab.id} {...input} />;
    },
    [],
  );
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const enabledAgentKinds = useMemo(
    () => SUPPORTED_DESKTOP_AGENT_KINDS.filter((agentKind) => inUseByAgentKind[agentKind]),
    [inUseByAgentKind],
  );
  const agentPresetMeta = useMemo(
    () =>
      Object.fromEntries(
        SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => [
          agentKind,
          { labelKey: AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind], launchCommand: DEFAULT_AGENT_COMMANDS[agentKind] },
        ]),
      ),
    [],
  );
  const gitCapable = !isFolderWorkspace(selectedWorkspace) && supportsGitFeatures(selectedProject?.sourceType);

  useEffect(() => {
    const browserTabIds = new Set(tabs.filter((tab) => tab.kind === "browser").map((tab) => tab.id));
    removeWebviewsForClosedTabs(browserTabIds);

    const terminalTabIds = new Set(tabs.filter((tab) => tab.kind === "terminal").map((tab) => tab.id));
    const agentChatTabIds = new Set(tabs.filter((tab) => tab.kind === "agent-chat").map((tab) => tab.id));
    retainOpenTerminalTabFocus(terminalTabIds);
    retainOpenTabFocus(agentChatTabIds);
    disposeTerminalRuntimesForClosedTabs(terminalTabIds);
  }, [tabs]);

  // Force-fit terminal runtimes when a terminal tab becomes the selected one so
  // the PTY surface fills the pane placeholder (Workbench presents, Terminal fits).
  useEffect(() => {
    const selectedTab = tabs.find((tab) => tab.id === selectedTabId);
    if (selectedTab?.kind !== "terminal") {
      return;
    }
    const terminalTabIds = tabs.filter((tab) => tab.kind === "terminal").map((tab) => tab.id);
    if (terminalTabIds.length === 0) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      forceFitTerminalRuntimes(terminalTabIds);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [tabs, selectedTabId]);

  const workspaceIdsWithTabs = useMemo(() => {
    const ids = new Set<string>();
    for (const tab of tabs) {
      ids.add(tab.workspaceId);
    }
    return ids;
  }, [tabs]);

  const tabsByWorkspaceId = useMemo(() => {
    const map = new Map<string, WorkbenchTab[]>();
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

  const hasSelectedWorkbenchTabs = workspaceIdsWithTabs.has(selectedWorkspaceId);

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
                    worktreePath={workspaces.find((ws) => ws.id === wsId)?.worktreePath}
                    enabledAgentKinds={enabledAgentKinds}
                    agentPresetMeta={agentPresetMeta}
                    tabFileCommands={{
                      createNewWhiteboard,
                      renameEntry,
                    }}
                    openTabRefreshCommands={{
                      readFile,
                      refreshFileTabFromDisk,
                      readDiff,
                      readCommitDiff,
                      readBranchComparisonDiff,
                      refreshDiffTabContent,
                    }}
                    fetchAgentSessionFilePath={fetchAgentSessionFilePath}
                    renderAgentIcon={(agentKind, label) => (
                      <AgentIcon agentKind={agentKind as never} context="tabMenu" label={label} />
                    )}
                    resolveFileTabIcon={(path) => getFileTreeIcon(path, false)}
                    renderSessionHistoryMenu={({ cwd, anchorEl, onClose, onSelectSession }) => (
                      <SessionHistoryMenu
                        cwd={cwd}
                        anchorEl={anchorEl}
                        onClose={onClose}
                        onSelectSession={onSelectSession}
                      />
                    )}
                    lastUsedExternalAppId={lastUsedExternalAppId}
                    findTabWithSession={findTabWithSession}
                    formatAgentSessionTitle={formatAgentSessionTitle}
                    renderTabContent={renderTabContent}
                    renderAgentChatSurface={renderAgentChatSurface}
                    closeTabWithCleanup={closeTabWithCleanup}
                    closeOtherTabsWithCleanup={closeOtherTabsWithCleanup}
                    closeAllTabsWithCleanup={closeAllTabsWithCleanup}
                  />
                </Box>
              ))}
              {!hasSelectedWorkbenchTabs && (
                <TabPanel active>
                  <LaunchView workspaceId={selectedWorkspaceId} enabledAgentKinds={enabledAgentKinds} />
                </TabPanel>
              )}
            </>
          )}
        </Box>

        <MainPaneRightArea
          selectedWorkspaceId={selectedWorkspaceId}
          gitCapable={gitCapable}
          isErrorWorkspace={isErrorWorkspace}
        />
      </Box>
      <FileSearchOverlay />
    </Box>
  );
}
