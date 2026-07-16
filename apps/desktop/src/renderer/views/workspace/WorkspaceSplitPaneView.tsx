import { Box } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuMessageCircle, LuSquareTerminal } from "react-icons/lu";
import { SYSTEM_FILE_MANAGER_APP_ID, findExternalAppPreset } from "../../../shared/contracts/externalApps";
import { findTabWithSession } from "../../commands/agentChatCommands";
import { AgentIcon } from "../../components/AgentIcon";
import { SplitPaneContainer } from "../../components/SplitPaneContainer";
import { SplitPaneGroup } from "../../components/SplitPaneGroup";
import { SessionHistoryMenu } from "../../components/agent/session/SessionHistoryMenu";
import { getFileTreeIcon } from "../../components/fileTreeIcons";
import { type DesktopAgentKind, SUPPORTED_DESKTOP_AGENT_KINDS } from "../../helpers/agentSettings";
import { formatAgentSessionTitle } from "../../helpers/agentSkillTextHelpers";
import { useCommands } from "../../hooks/useCommands";
import { type RefreshableOpenTab, useOpenTabAutoRefresh } from "../../hooks/useOpenTabAutoRefresh";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";
import type { PaneLeaf, SplitPaneNode } from "../../store/split-pane";
import { splitPaneStore } from "../../store/splitPaneStore";
import { tabStore } from "../../store/tabStore";
import type { WorkspaceTab } from "../../store/types";
import { workspaceStore } from "../../store/workspaceStore";
import { WorkspaceTabSurfaceLayer } from "./WorkspaceTabSurfaceLayer";
import { usePaneTabHandlers } from "./usePaneTabHandlers";
import { useTabContentRenderer } from "./useTabContentRenderer";
import { useWorkspaceTabPlacements } from "./useWorkspaceTabPlacements";
import { FaviconIcon, toTabBarDescriptor } from "./workspaceSplitPaneHelpers";

// ─── Per-workspace split pane ─────────────────────────────────────────────────

export type WorkspaceSplitPaneProps = {
  workspaceId: string;
  isActive: boolean;
  workspaceTabs: WorkspaceTab[];
};

/**
 * Renders the split-pane layout for a single workspace.
 *
 * Each workspace gets its own instance, kept mounted in the DOM and hidden via
 * `display: none` when inactive, so terminals/editors preserve their state.
 */
export function WorkspaceSplitPane({ workspaceId, isActive, workspaceTabs }: WorkspaceSplitPaneProps) {
  const cmd = useCommands();
  const workspaces = workspaceStore((state) => state.workspaces);
  const selectedTabId = tabStore((state) => state.selectedTabId);
  const workspace = workspaces.find((ws) => ws.id === workspaceId);
  const lastUsedExternalAppId = workspaceStore((state) => state.lastUsedExternalAppId);
  const lastUsedExternalAppPreset = lastUsedExternalAppId ? findExternalAppPreset(lastUsedExternalAppId) : null;
  const externalAppLabel = lastUsedExternalAppPreset
    ? `Open in ${lastUsedExternalAppPreset.label}`
    : "Open in external app";

  const handleOpenExternalApp = async (filePath: string) => {
    const workspaceWorktreePath = workspace?.worktreePath;
    if (!workspaceWorktreePath) return;
    try {
      await cmd.openEntryInExternalApp({
        workspaceWorktreePath,
        appId: lastUsedExternalAppId ?? SYSTEM_FILE_MANAGER_APP_ID,
        relativePath: filePath,
      });
    } catch (error) {
      console.error("Failed to open workspace file externally", error);
    }
  };

  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const enabledAgentKinds = useMemo(
    () => SUPPORTED_DESKTOP_AGENT_KINDS.filter((agentKind) => inUseByAgentKind[agentKind]),
    [inUseByAgentKind],
  );
  const enabledAgentKindSet = useMemo(() => new Set(enabledAgentKinds), [enabledAgentKinds]);

  const [focusContentRequestKey, setFocusContentRequestKey] = useState(0);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [historyMenuAnchor, setHistoryMenuAnchor] = useState<HTMLElement | null>(null);
  const didTrackSelectedTabRef = useRef(false);
  const didSyncPaneSelectionRef = useRef(false);
  const lastKnownRectByTabIdRef = useRef<Record<string, { left: number; top: number; width: number; height: number }>>(
    {},
  );

  const layout = splitPaneStore((state) => state.layoutByWorkspaceId[workspaceId]);
  const splitRoot = layout?.root;
  const activePaneId = layout?.activePaneId ?? "";
  const { tabPlacements, handleContentPlaceholderChange } = useWorkspaceTabPlacements({ splitRoot, activePaneId });

  const tabById = useMemo(() => {
    const map = new Map<string, WorkspaceTab>();
    for (const tab of workspaceTabs) {
      map.set(tab.id, tab);
    }
    return map;
  }, [workspaceTabs]);

  // Sync workspace tabs into this workspace's layout
  const previousTabIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentTabIds = new Set(workspaceTabs.map((tab) => tab.id));
    const previousTabIds = previousTabIdsRef.current;

    for (const tabId of currentTabIds) {
      if (!previousTabIds.has(tabId)) {
        const existingPane = splitPaneStore.getState().getPaneForTab(workspaceId, tabId);
        if (!existingPane) {
          splitPaneStore.getState().registerTabInPane(workspaceId, tabId);
        }
      }
    }

    for (const tabId of previousTabIds) {
      if (!currentTabIds.has(tabId)) {
        splitPaneStore.getState().unregisterTabFromPane(workspaceId, tabId);
      }
    }

    previousTabIdsRef.current = currentTabIds;
  }, [workspaceId, workspaceTabs]);

  // Sync tabStore.selectedTabId to splitPaneStore when a tab is selected programmatically
  useEffect(() => {
    if (!didSyncPaneSelectionRef.current) {
      didSyncPaneSelectionRef.current = true;
      return;
    }
    if (!selectedTabId || !isActive) return;

    const tab = tabById.get(selectedTabId);
    if (!tab || tab.workspaceId !== workspaceId) return;

    const pane = splitPaneStore.getState().getPaneForTab(workspaceId, selectedTabId);
    if (!pane) return;

    if (pane.selectedTabId !== selectedTabId || activePaneId !== pane.id) {
      splitPaneStore.getState().selectTab(workspaceId, pane.id, selectedTabId);
    }
  }, [selectedTabId, isActive, workspaceId, activePaneId, tabById]);

  // Auto-refresh open file/diff tabs
  const refreshableTabs = useMemo(
    (): RefreshableOpenTab[] =>
      workspaceTabs.reduce<RefreshableOpenTab[]>((result, tab) => {
        if (tab.kind === "file") {
          result.push({
            id: tab.id,
            kind: "file",
            path: tab.data.path,
            isDirty: tab.data.isDirty,
            isUnsupported: Boolean(tab.data.isUnsupported),
          });
        } else if (tab.kind === "diff") {
          result.push({ id: tab.id, kind: "diff", path: tab.data.path, source: tab.data.source });
        }
        return result;
      }, []),
    [workspaceTabs],
  );

  useOpenTabAutoRefresh({
    workspaceId: workspace?.id,
    tabs: refreshableTabs,
    commands: cmd,
  });

  // Focus content when the selected tab changes
  useEffect(() => {
    if (!didTrackSelectedTabRef.current) {
      didTrackSelectedTabRef.current = true;
      return;
    }
    if (!selectedTabId || !isActive) return;
    setFocusContentRequestKey((k) => k + 1);
  }, [selectedTabId, isActive]);

  // Focus the active tab content when this workspace becomes active (e.g. workspace switch)
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (isActive && !wasActive && selectedTabId) {
      setFocusContentRequestKey((k) => k + 1);
    }
  }, [isActive, selectedTabId]);

  // ─── Pane tab handlers ──────────────────────────────────────────────────────

  const {
    handleSelectTab,
    handleCloseTab,
    handleCreateTab,
    handleReorderTab,
    handleSplitDrop,
    handleFocusPane,
    handleTabDragStart,
    handleTabDragEnd,
    handleSplitRight,
    handleSplitDown,
    handleSplitRatioChange,
  } = usePaneTabHandlers({
    workspaceId,
    workspaceTabs,
    workspace,
    enabledAgentKindSet: enabledAgentKindSet as Set<DesktopAgentKind>,
    cmd,
    setFocusContentRequestKey,
    setIsDraggingSplit,
  });

  // ─── Tab icon resolver ──────────────────────────────────────────────────────

  const getTabIcon = useCallback(
    (tab: { id: string; kind?: string }) => {
      const fullTab = tabById.get(tab.id);
      if (fullTab?.kind === "terminal") {
        if (fullTab.data.agentKind) {
          return <AgentIcon agentKind={fullTab.data.agentKind} context="tabMenu" decorative />;
        }
        return <LuSquareTerminal size={14} />;
      }
      if (fullTab?.kind === "agent-chat") return <LuMessageCircle size={14} />;
      if (fullTab?.kind === "browser") return <FaviconIcon url={fullTab.data.faviconUrl} size={14} />;
      if (fullTab?.kind === "file" || fullTab?.kind === "diff" || fullTab?.kind === "image") {
        return (
          <Box
            component="img"
            src={getFileTreeIcon(fullTab.data.path, false)}
            alt=""
            sx={{ width: 14, height: 14, flexShrink: 0 }}
          />
        );
      }
      return null;
    },
    [tabById],
  );

  // ─── Tab content renderer ───────────────────────────────────────────────────

  const renderTabContent = useTabContentRenderer({
    workspace,
    externalAppLabel,
    focusContentRequestKey,
    isWorkspaceActive: isActive,
    cmd,
    onOpenExternalApp: handleOpenExternalApp,
  });

  const renderPaneContent = useCallback((_pane: PaneLeaf, _placeholder: HTMLDivElement | null) => null, []);

  // ─── Pane renderer ────────────────────────────────────────────────────────

  const renderPane = useCallback(
    (pane: PaneLeaf) => {
      const paneTabs = pane.tabIds
        .map((tabId) => tabById.get(tabId))
        .filter((tab): tab is WorkspaceTab => tab != null)
        .sort((a, b) => {
          if (a.pinned === b.pinned) return 0;
          return a.pinned ? -1 : 1;
        })
        .map(toTabBarDescriptor);

      return (
        <SplitPaneGroup
          key={pane.id}
          pane={pane}
          isActive={pane.id === activePaneId}
          tabs={paneTabs}
          isDraggingSplit={isDraggingSplit}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onCloseOtherTabs={cmd.closeOtherTabs}
          onCloseAllTabs={cmd.closeAllTabs}
          onTogglePinTab={cmd.toggleTabPinned}
          onReorderTab={handleReorderTab}
          onCreateTab={handleCreateTab}
          onPromoteTemporaryTab={cmd.promoteTemporaryTab}
          onSplitDrop={handleSplitDrop}
          onSplitRight={handleSplitRight}
          onSplitDown={handleSplitDown}
          onFocusPane={handleFocusPane}
          onTabDragStart={handleTabDragStart}
          onTabDragEnd={handleTabDragEnd}
          onHistoryClick={(event) => setHistoryMenuAnchor(event.currentTarget)}
          getTabIcon={getTabIcon}
          enabledAgentKinds={enabledAgentKinds}
          disabled={!workspaceId}
          onContentPlaceholderChange={handleContentPlaceholderChange}
          renderContent={renderPaneContent}
        />
      );
    },
    [
      activePaneId,
      isDraggingSplit,
      tabById,
      handleSelectTab,
      handleCloseTab,
      cmd,
      handleReorderTab,
      handleCreateTab,
      handleSplitDrop,
      handleSplitRight,
      handleSplitDown,
      handleFocusPane,
      handleTabDragStart,
      handleTabDragEnd,
      getTabIcon,
      enabledAgentKinds,
      workspaceId,
      handleContentPlaceholderChange,
      renderPaneContent,
    ],
  );

  if (!splitRoot) return null;

  return (
    <Box sx={{ position: "relative", height: "100%" }}>
      <SplitPaneContainer node={splitRoot} renderPane={renderPane} onSplitRatioChange={handleSplitRatioChange} />
      <WorkspaceTabSurfaceLayer
        isActive={isActive}
        isDraggingSplit={isDraggingSplit}
        workspaceTabs={workspaceTabs}
        tabPlacements={tabPlacements}
        lastKnownRectByTabIdRef={lastKnownRectByTabIdRef}
        handleFocusPane={handleFocusPane}
        renderTabContent={renderTabContent}
      />
      {workspace?.worktreePath && (
        <SessionHistoryMenu
          cwd={workspace.worktreePath}
          anchorEl={historyMenuAnchor}
          onClose={() => setHistoryMenuAnchor(null)}
          onSelectSession={(session, title) => {
            // Check if this Pi session is already active in a tab.
            const existingTabId =
              findTabWithSession(session.sessionId) ??
              workspaceTabs.find((tab) => tab.kind === "agent-chat" && tab.data.sessionId === session.sessionId)?.id;
            if (existingTabId) {
              cmd.selectTab(existingTabId);
              return;
            }
            cmd.openTab({
              workspaceId,
              kind: "agent-chat",
              title: formatAgentSessionTitle(title),
              cwd: session.cwd?.trim() || workspace.worktreePath,
              sessionId: session.sessionId,
            });
          }}
        />
      )}
    </Box>
  );
}
