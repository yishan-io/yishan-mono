import { Badge, Box } from "@mui/material";
import { WorkspaceAgentChatSurface, fetchAgentSessionFilePath, findTabWithSession } from "@renderer/domains/agent";
import { AgentIcon, SessionHistoryMenu } from "@renderer/domains/agent";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  DEFAULT_AGENT_COMMANDS,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "@renderer/domains/agent";
import { formatAgentSessionTitle } from "@renderer/domains/agent";
import { useAgentKindsInUse } from "@renderer/domains/agent";
import { removeWebviewsForClosedTabs } from "@renderer/domains/browser";
import { FileSearchOverlay } from "@renderer/domains/files";
import { getFileTreeIcon } from "@renderer/domains/files";
import { gitProjectionStore } from "@renderer/domains/git";
import { useLastUsedExternalAppId } from "@renderer/domains/project";
import { supportsGitFeatures } from "@renderer/domains/project";
import { disposeTerminalRuntimesForClosedTabs, forceFitTerminalRuntimes } from "@renderer/domains/terminal";
import {
  DEFAULT_RIGHT_PANE_TAB,
  RightPaneTabBar,
  type RightPaneTabDef,
  WorkspaceSplitPane,
  layoutStore,
  resizeRightPane,
  setRightPaneTab,
  tabStore,
  workbenchNavigationStore,
} from "@renderer/domains/workbench";
import type { WorkbenchTab } from "@renderer/domains/workbench";
import { useWorkspacePaneVisibilityContext } from "@renderer/domains/workbench";
import { ColumnSeparator } from "@renderer/domains/workbench";
import { TabPanel } from "@renderer/domains/workbench";
import { retainOpenTabFocus } from "@renderer/domains/workbench";
import { workspaceStore } from "@renderer/domains/workspace";
import { WorkspaceErrorStateView } from "@renderer/domains/workspace";
import { isFolderWorkspace } from "@renderer/domains/workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuFolderTree, LuGitBranch, LuGitPullRequest } from "react-icons/lu";
import { SYSTEM_FILE_MANAGER_APP_ID, findExternalAppPreset } from "../../../../shared/contracts/externalApps";
import { DARK_SURFACE_COLORS } from "../../../theme";
import { useFileCommands, useGitCommands, useTerminalCommands, useWorkbenchCommands } from "../../commands/useCommands";
import { useSelectedWorkspaceWithProject } from "../../selectors";
import { LaunchView } from "../launch/LaunchView";
import { useTabContentRenderer } from "../tab-content/useTabContentRenderer";
import { MainPaneTitleBarView } from "../title-bar/MainPaneTitleBarView";
import { RightPaneView } from "./RightPaneView";

const RIGHT_MIN_WIDTH = 280;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Renders the primary workspace pane with split-pane tabbed content, per-tab views, and pane visibility controls. */
export function MainPaneView() {
  const { t } = useTranslation();
  const cmd = useTerminalCommands();
  const workbenchCommands = useWorkbenchCommands();
  const fileCommands = useFileCommands();
  const gitCommands = useGitCommands();
  const selectedWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const workspaces = workspaceStore((state) => state.workspaces) ?? [];
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const { selectedProject } = useSelectedWorkspaceWithProject();
  const isErrorWorkspace = selectedWorkspace?.state === "error";
  const tabs = tabStore((state) => state.tabs);
  const selectedTabId = tabStore((state) => state.selectedTabId);
  const mergedCmd = useMemo(
    () => ({ ...workbenchCommands, ...fileCommands, ...gitCommands }),
    [workbenchCommands, fileCommands, gitCommands],
  );
  const lastUsedExternalAppId = useLastUsedExternalAppId();
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
  const inUseByAgentKind = useAgentKindsInUse();
  const { rightCollapsed, onToggleRightPane, showRightPane } = useWorkspacePaneVisibilityContext();
  const rightWidth = layoutStore((state) => state.rightWidth);
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
  const activeRightPaneTab = layoutStore(
    (state) => state.rightPaneTabByWorkspaceId[selectedWorkspaceId] ?? DEFAULT_RIGHT_PANE_TAB,
  );
  const changesCount = gitProjectionStore((state) => state.gitChangesCountByWorkspaceId[selectedWorkspaceId] ?? 0);
  const rightPaneTabs: RightPaneTabDef[] = useMemo(() => {
    const tabs: RightPaneTabDef[] = [
      {
        value: "files",
        label: t("files.files"),
        shortcutId: "activate-files-pane",
        icon: <LuFolderTree size={18} />,
      },
    ];
    if (gitCapable) {
      tabs.push(
        {
          value: "changes",
          label: t("files.changes"),
          shortcutId: "activate-changes-pane",
          icon: (
            <Badge
              badgeContent={changesCount}
              color="primary"
              max={99}
              invisible={changesCount <= 0}
              sx={{
                "& .MuiBadge-badge": {
                  minWidth: 14,
                  height: 14,
                  fontSize: 9,
                  lineHeight: 1,
                },
              }}
            >
              <LuGitBranch size={18} />
            </Badge>
          ),
        },
        {
          value: "pr",
          label: t("workspace.pr.tab"),
          shortcutId: "activate-pr-pane",
          icon: <LuGitPullRequest size={18} />,
        },
      );
    }
    return tabs;
  }, [gitCapable, changesCount, t]);

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
    resizeRightPane(nextWidth);
  }, []);

  useEffect(() => {
    const browserTabIds = new Set(tabs.filter((tab) => tab.kind === "browser").map((tab) => tab.id));
    removeWebviewsForClosedTabs(browserTabIds);

    const terminalTabIds = new Set(tabs.filter((tab) => tab.kind === "terminal").map((tab) => tab.id));
    const agentChatTabIds = new Set(tabs.filter((tab) => tab.kind === "agent-chat").map((tab) => tab.id));
    cmd.retainOpenTerminalTabFocus(terminalTabIds);
    retainOpenTabFocus(agentChatTabIds);
    disposeTerminalRuntimesForClosedTabs(terminalTabIds);
  }, [cmd, tabs]);

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
                      createNewWhiteboard: fileCommands.createNewWhiteboard,
                      renameEntry: fileCommands.renameEntry,
                    }}
                    openTabRefreshCommands={{
                      readFile: fileCommands.readFile,
                      refreshFileTabFromDisk: fileCommands.refreshFileTabFromDisk,
                      readDiff: gitCommands.readDiff,
                      readCommitDiff: gitCommands.readCommitDiff,
                      readBranchComparisonDiff: gitCommands.readBranchComparisonDiff,
                      refreshDiffTabContent: gitCommands.refreshDiffTabContent,
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
            tabs={rightPaneTabs}
            activeRightPaneTab={activeRightPaneTab}
            rightCollapsed={rightCollapsed}
            onToggleRightPane={onToggleRightPane}
            showRightPane={showRightPane}
            onSelectTab={(tab) => setRightPaneTab(selectedWorkspaceId, tab)}
          />
        )}
      </Box>
      <FileSearchOverlay />
    </Box>
  );
}
