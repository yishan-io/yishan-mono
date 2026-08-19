import { Box } from "@mui/material";
import {
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  openTab,
  promoteTemporaryTab,
  renameTab,
  renameTabsForEntryRename,
  setSelectedTab as selectTab,
  toggleTabPinned,
} from "@renderer/domains/workbench";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuMessageCircle, LuSquareTerminal } from "react-icons/lu";
import type { ExternalAppId } from "@renderer/domains/workbench";
import type { PaneLeaf, SplitPaneNode } from "../../../../domains/workbench/model/split-pane";
import type { WorkbenchTab } from "../../../../domains/workbench/model/types";
import { selectPaneForTab } from "../../../../domains/workbench/state/workbenchSelectors";
import { splitPaneStore } from "../../state/splitPaneStore";
import { tabStore } from "../../state/tabStore";
import { selectLayoutByWorkspaceId } from "../../state/workbenchSelectors";
import { WorkspaceTabSurfaceLayer } from "./WorkspaceTabSurfaceLayer";
import { SplitPaneContainer } from "./pane/SplitPaneContainer";
import { SplitPaneGroup } from "./pane/SplitPaneGroup";
import {
  type OpenTabAutoRefreshCommands,
  type RefreshableOpenTab,
  useOpenTabAutoRefresh,
} from "./useOpenTabAutoRefresh";
import { type AgentPresetMeta, usePaneTabHandlers } from "./usePaneTabHandlers";
import { useWorkspaceTabPlacements } from "./useWorkspaceTabPlacements";
import { FaviconIcon, toTabBarDescriptor } from "./workspaceSplitPaneHelpers";

// ─── Per-workspace split pane ─────────────────────────────────────────────────

export type WorkspaceSplitPaneProps = {
  workspaceId: string;
  isActive: boolean;
  workspaceTabs: WorkbenchTab[];
  /** Worktree path for the workspace backing this pane (App-composed data). */
  worktreePath: string | undefined;
  /** Agent kinds currently in use, resolved by the App composition layer. */
  enabledAgentKinds: string[];
  /** Agent terminal preset metadata for the tab create menu (App-composed; agent-owned). */
  agentPresetMeta: Record<string, AgentPresetMeta>;
  /** Files tab-file commands used by tab gestures (App-composed; files-owned). */
  tabFileCommands: {
    createNewWhiteboard: (workspaceId: string) => Promise<string | null>;
    renameEntry: (input: {
      workspaceId: string;
      fromRelativePath: string;
      toRelativePath: string;
    }) => Promise<{ ok: true }>;
  };
  /** Refreshes open file/diff tabs after backend changes (App-composed; files/git-owned). */
  openTabRefreshCommands: OpenTabAutoRefreshCommands;
  /** Resolves one agent transcript file path for the tab context menu (App-supplied). */
  fetchAgentSessionFilePath?: (sessionId: string, cwd: string) => Promise<string>;
  /** Renders one agent icon (App-supplied; agent-owned). */
  renderAgentIcon?: (agentKind: string, label?: string) => React.ReactNode;
  /** Resolves one file tab icon src (App-supplied; files-owned). */
  resolveFileTabIcon?: (path: string) => string;
  /** Renders the session-history menu for the tab bar (App-supplied; agent-owned). */
  renderSessionHistoryMenu?: (input: {
    cwd: string;
    anchorEl: HTMLElement | null;
    onClose: () => void;
    onSelectSession: (session: { sessionId: string; cwd?: string | null }, title: string) => void;
  }) => React.ReactNode;
  /** Last used external app id for "open in app" actions. */
  lastUsedExternalAppId: ExternalAppId | undefined;
  /** Opens an existing agent-chat tab for a session, or null when absent. */
  findTabWithSession: (sessionId: string) => string | undefined;
  /** Formats an agent session title for the tab bar. */
  formatAgentSessionTitle: (title: string) => string;
  /** App-composed tab content renderer (product UI). */
  renderTabContent: (tab: WorkbenchTab, isSelected: boolean, isInActivePane: boolean) => React.ReactNode;
  /** App-composed agent-chat surface renderer (product UI). */
  renderAgentChatSurface: (input: {
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
  }) => React.ReactNode;
};

/**
 * Renders the split-pane layout for a single workspace.
 *
 * Each workspace gets its own instance, kept mounted in the DOM and hidden via
 * `display: none` when inactive, so terminals/editors preserve their state.
 */
export function WorkspaceSplitPane({
  workspaceId,
  isActive,
  workspaceTabs,
  worktreePath,
  enabledAgentKinds,
  agentPresetMeta,
  tabFileCommands,
  openTabRefreshCommands,
  fetchAgentSessionFilePath,
  renderAgentIcon,
  resolveFileTabIcon,
  renderSessionHistoryMenu,
  lastUsedExternalAppId,
  findTabWithSession,
  formatAgentSessionTitle,
  renderTabContent,
  renderAgentChatSurface,
}: WorkspaceSplitPaneProps) {
  // Stable identity: passed to tab handlers + open-tab auto-refresh; a fresh
  // object every render would re-run their effects on each render.
  const cmd = useMemo(
    () => ({ openTab, closeTab, selectTab, renameTab, renameTabsForEntryRename, ...tabFileCommands }),
    [tabFileCommands],
  );
  const selectedTabId = tabStore((state) => state.selectedTabId);
  const workspace = { worktreePath };
  const enabledAgentKindSet = useMemo(() => new Set(enabledAgentKinds), [enabledAgentKinds]);
  const agentCreateOptions = useMemo(
    () =>
      enabledAgentKinds.map((agentKind) => ({
        option: agentKind,
        label: agentPresetMeta[agentKind]?.labelKey ?? agentKind,
        icon: renderAgentIcon ? (
          renderAgentIcon(agentKind, agentPresetMeta[agentKind]?.labelKey ?? agentKind)
        ) : (
          <Box component="span" sx={{ width: 14, height: 14 }} />
        ),
      })),
    [enabledAgentKinds, agentPresetMeta, renderAgentIcon],
  );

  const [focusContentRequestKey, setFocusContentRequestKey] = useState(0);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [historyMenuAnchor, setHistoryMenuAnchor] = useState<HTMLElement | null>(null);
  const didSyncPaneSelectionRef = useRef(false);
  const lastKnownRectByTabIdRef = useRef<Record<string, { left: number; top: number; width: number; height: number }>>(
    {},
  );

  const layout = splitPaneStore((state) => selectLayoutByWorkspaceId(state, workspaceId));
  const splitRoot = layout?.root;
  const activePaneId = layout?.activePaneId ?? "";
  const { tabPlacements, handleContentPlaceholderChange } = useWorkspaceTabPlacements({ splitRoot, activePaneId });

  const tabById = useMemo(() => {
    const map = new Map<string, WorkbenchTab>();
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
        const existingPane = selectPaneForTab(splitPaneStore.getState(), workspaceId, tabId);
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

    const pane = selectPaneForTab(splitPaneStore.getState(), workspaceId, selectedTabId);
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
          });
        } else if (tab.kind === "diff") {
          result.push({ id: tab.id, kind: "diff", path: tab.data.path, source: tab.data.source });
        }
        return result;
      }, []),
    [workspaceTabs],
  );

  useOpenTabAutoRefresh({
    workspaceId,
    tabs: refreshableTabs,
    commands: openTabRefreshCommands,
  });

  // ─── Pane tab handlers ──────────────────────────────────────────────────────

  const {
    handleSelectTab,
    handleCloseTab,
    handleCreateTab,
    handleRenameTab,
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
    enabledAgentKindSet: enabledAgentKindSet,
    agentPresetMeta: agentPresetMeta,
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
          return renderAgentIcon ? renderAgentIcon(fullTab.data.agentKind) : <LuSquareTerminal size={14} />;
        }
        return <LuSquareTerminal size={14} />;
      }
      if (fullTab?.kind === "agent-chat") return <LuMessageCircle size={14} />;
      if (fullTab?.kind === "browser") return <FaviconIcon url={fullTab.data.faviconUrl} size={14} />;
      if (
        fullTab?.kind === "file" ||
        fullTab?.kind === "diff" ||
        fullTab?.kind === "image" ||
        fullTab?.kind === "video" ||
        fullTab?.kind === "audio"
      ) {
        return (
          <Box
            component="img"
            src={resolveFileTabIcon ? resolveFileTabIcon(fullTab.data.path) : ""}
            alt=""
            sx={{ width: 14, height: 14, flexShrink: 0 }}
          />
        );
      }
      return null;
    },
    [tabById, renderAgentIcon, resolveFileTabIcon],
  );

  // ─── Tab content renderer ───────────────────────────────────────────────────

  const renderPaneContent = useCallback((_pane: PaneLeaf, _placeholder: HTMLDivElement | null) => null, []);

  // ─── Pane renderer ────────────────────────────────────────────────────────

  const renderPane = useCallback(
    (pane: PaneLeaf) => {
      const paneTabs = pane.tabIds
        .map((tabId) => tabById.get(tabId))
        .filter((tab): tab is WorkbenchTab => tab != null)
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
          onCloseOtherTabs={closeOtherTabs}
          onCloseAllTabs={closeAllTabs}
          onTogglePinTab={toggleTabPinned}
          onReorderTab={handleReorderTab}
          onCreateTab={handleCreateTab}
          onPromoteTemporaryTab={promoteTemporaryTab}
          onSplitDrop={handleSplitDrop}
          onSplitRight={handleSplitRight}
          onSplitDown={handleSplitDown}
          onFocusPane={handleFocusPane}
          onTabDragStart={handleTabDragStart}
          onTabDragEnd={handleTabDragEnd}
          onRenameTab={handleRenameTab}
          onHistoryClick={(event) => setHistoryMenuAnchor(event.currentTarget)}
          getTabIcon={getTabIcon}
          enabledAgentKinds={enabledAgentKinds}
          agentCreateOptions={agentCreateOptions}
          fetchAgentSessionFilePath={fetchAgentSessionFilePath}
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
      handleRenameTab,
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
      agentCreateOptions,
      fetchAgentSessionFilePath,
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
        renderAgentChatSurface={renderAgentChatSurface}
      />
      {workspace?.worktreePath &&
        renderSessionHistoryMenu?.({
          cwd: workspace.worktreePath,
          anchorEl: historyMenuAnchor,
          onClose: () => setHistoryMenuAnchor(null),
          onSelectSession: (session, title) => {
            // Check if this Pi session is already active in a full agent-chat
            // tab (subagent-detail tabs are read-only and not candidates).
            const existingTabId =
              findTabWithSession(session.sessionId) ??
              workspaceTabs.find(
                (tab) =>
                  tab.kind === "agent-chat" &&
                  tab.data.sessionView !== "subagent-detail" &&
                  tab.data.sessionId === session.sessionId,
              )?.id;
            if (existingTabId) {
              selectTab(existingTabId);
              return;
            }
            openTab({
              workspaceId,
              kind: "agent-chat",
              title: formatAgentSessionTitle(title),
              cwd: session.cwd?.trim() || workspace.worktreePath,
              sessionId: session.sessionId,
            });
          },
        })}
    </Box>
  );
}
