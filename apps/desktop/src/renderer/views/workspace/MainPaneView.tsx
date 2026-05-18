import { Box } from "@mui/material";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuGlobe, LuSquareTerminal } from "react-icons/lu";
import { SYSTEM_FILE_MANAGER_APP_ID, findExternalAppPreset } from "../../../shared/contracts/externalApps";
import { SplitPaneContainer } from "../../components/SplitPaneContainer";
import { SplitPaneGroup } from "../../components/SplitPaneGroup";
import { TabPanel } from "../../components/TabPanel";
import { getFileTreeIcon } from "../../components/fileTreeIcons";
import { type DesktopAgentKind, SUPPORTED_DESKTOP_AGENT_KINDS } from "../../helpers/agentSettings";
import { useCommands } from "../../hooks/useCommands";
import { type RefreshableOpenTab, useOpenTabAutoRefresh } from "../../hooks/useOpenTabAutoRefresh";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";
import type { PaneLeaf, SplitPaneNode } from "../../store/split-pane";
import { splitPaneStore } from "../../store/splitPaneStore";
import { tabStore } from "../../store/tabStore";
import type { WorkspaceTab } from "../../store/types";
import { workspaceStore } from "../../store/workspaceStore";
import { DARK_SURFACE_COLORS } from "../../theme";
import { LaunchView } from "./LaunchView";
import { MainPaneTitleBarView } from "./MainPaneTitleBarView";
import { removeWebviewsForClosedTabs } from "./browser/webviewRegistry";
import { getOrCreateRuntimeRoot } from "./runtime/runtimeRoot";
import { disposeTerminalRuntimesForClosedTabs } from "./terminal/terminalRuntimeRegistry";
import { usePaneTabHandlers } from "./usePaneTabHandlers";
import { useTabContentRenderer } from "./useTabContentRenderer";

// ─── Small helpers ────────────────────────────────────────────────────────────

function FaviconIcon({ url, size }: { url?: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <LuGlobe size={size} />;
  }
  return (
    <Box
      component="img"
      src={url}
      alt=""
      sx={{ width: size, height: size, flexShrink: 0, objectFit: "contain" }}
      onError={() => setFailed(true)}
    />
  );
}

function collectPaneLeaves(node: SplitPaneNode | null | undefined): PaneLeaf[] {
  if (!node) {
    return [];
  }
  if (node.kind === "leaf") {
    return [node];
  }
  return [...collectPaneLeaves(node.first), ...collectPaneLeaves(node.second)];
}

/** Converts a full WorkspaceTab to the lightweight descriptor used by TabBar/SplitPaneGroup. */
function toTabBarDescriptor(tab: WorkspaceTab) {
  return {
    id: tab.id,
    title: tab.title,
    pinned: tab.pinned,
    kind: tab.kind,
    isDirty: tab.kind === "file" ? tab.data.isDirty : false,
    isTemporary: ["file", "image", "diff"].includes(tab.kind)
      ? (tab.data as { isTemporary: boolean }).isTemporary
      : false,
  };
}

// ─── Per-workspace split pane ─────────────────────────────────────────────────

type WorkspaceSplitPaneProps = {
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
function WorkspaceSplitPane({ workspaceId, isActive, workspaceTabs }: WorkspaceSplitPaneProps) {
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
  const didTrackSelectedTabRef = useRef(false);
  const didSyncPaneSelectionRef = useRef(false);
  const [panePlaceholders, setPanePlaceholders] = useState<Record<string, HTMLDivElement | null>>({});
  const [layoutVersion, setLayoutVersion] = useState(0);
  const lastKnownRectByTabIdRef = useRef<Record<string, { left: number; top: number; width: number; height: number }>>(
    {},
  );

  const layout = splitPaneStore((state) => state.layoutByWorkspaceId[workspaceId]);
  const splitRoot = layout?.root;
  const activePaneId = layout?.activePaneId ?? "";

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
    workspaceWorktreePath: workspace?.worktreePath,
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
    enabledAgentKindSet: enabledAgentKindSet as Set<DesktopAgentKind>,
    cmd,
    setFocusContentRequestKey,
    setIsDraggingSplit,
  });

  // ─── Tab icon resolver ──────────────────────────────────────────────────────

  const getTabIcon = useCallback(
    (tab: { id: string; kind?: string }) => {
      const fullTab = tabById.get(tab.id);
      if (fullTab?.kind === "terminal") return <LuSquareTerminal size={14} />;
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
    cmd,
    onOpenExternalApp: handleOpenExternalApp,
  });

  // ─── Tab surface renderer (fixed-position portal overlay) ─────────────────

  const renderTabSurface = useCallback(
    (
      tab: WorkspaceTab,
      isSelected: boolean,
      isInActivePane: boolean,
      rect: { left: number; top: number; width: number; height: number } | null,
      paneId: string,
    ) => {
      const hasArea = Boolean(rect && rect.width > 1 && rect.height > 1);
      if (hasArea && rect) {
        lastKnownRectByTabIdRef.current[tab.id] = rect;
      }
      const effectiveRect = rect ?? lastKnownRectByTabIdRef.current[tab.id] ?? null;
      const shouldShow =
        isActive && isSelected && Boolean(effectiveRect && effectiveRect.width > 1 && effectiveRect.height > 1);
      const style = effectiveRect
        ? {
            position: "fixed" as const,
            left: effectiveRect.left,
            top: effectiveRect.top,
            width: effectiveRect.width,
            height: effectiveRect.height,
            display: shouldShow && !isDraggingSplit ? "flex" : "none",
            flexDirection: "column" as const,
            pointerEvents: shouldShow && !isDraggingSplit ? "auto" : "none",
          }
        : {
            position: "absolute" as const,
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            display: "none",
            pointerEvents: "none",
          };

      return (
        <Box
          key={tab.id}
          sx={style}
          onMouseDown={() => {
            if (!isInActivePane) {
              handleFocusPane(paneId);
            }
          }}
        >
          {renderTabContent(tab, isSelected, isInActivePane)}
        </Box>
      );
    },
    [isActive, isDraggingSplit, handleFocusPane, renderTabContent],
  );

  const renderPaneContent = useCallback((_pane: PaneLeaf, _placeholder: HTMLDivElement | null) => null, []);

  const handleContentPlaceholderChange = useCallback((paneId: string, placeholder: HTMLDivElement | null) => {
    setPanePlaceholders((prev) => (prev[paneId] === placeholder ? prev : { ...prev, [paneId]: placeholder }));
  }, []);

  // ─── Layout / resize observer ─────────────────────────────────────────────

  const tabPlacements = useMemo(() => {
    const placements = new Map<
      string,
      {
        paneId: string;
        selected: boolean;
        activePane: boolean;
        rect: { left: number; top: number; width: number; height: number } | null;
      }
    >();
    if (!splitRoot) {
      return placements;
    }
    const leaves = collectPaneLeaves(splitRoot);
    for (const pane of leaves) {
      const placeholder = panePlaceholders[pane.id];
      let rect: { left: number; top: number; width: number; height: number } | null = null;
      if (placeholder) {
        const bounds = placeholder.getBoundingClientRect();
        rect = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
      }
      for (const tabId of pane.tabIds) {
        placements.set(tabId, {
          paneId: pane.id,
          selected: tabId === pane.selectedTabId,
          activePane: pane.id === activePaneId,
          rect,
        });
      }
    }
    return placements;
  }, [splitRoot, panePlaceholders, layoutVersion, activePaneId]);

  useLayoutEffect(() => {
    const observedElements = Object.values(panePlaceholders).filter(
      (element): element is HTMLDivElement => element != null,
    );
    if (observedElements.length === 0 || typeof ResizeObserver !== "function") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      setLayoutVersion((version) => version + 1);
    });

    for (const element of observedElements) {
      resizeObserver.observe(element);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [panePlaceholders]);

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
          onRenameTab={handleRenameTab}
          onSplitDrop={handleSplitDrop}
          onSplitRight={handleSplitRight}
          onSplitDown={handleSplitDown}
          onFocusPane={handleFocusPane}
          onTabDragStart={handleTabDragStart}
          onTabDragEnd={handleTabDragEnd}
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
      handleRenameTab,
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
      {createPortal(
        <Box
          sx={{
            position: "fixed",
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            pointerEvents: "none",
            opacity: isDraggingSplit ? 0.28 : 1,
            transition: "opacity 120ms ease-out",
          }}
        >
          {workspaceTabs.map((tab) => {
            const placement = tabPlacements.get(tab.id);
            return renderTabSurface(
              tab,
              placement?.selected ?? false,
              placement?.activePane ?? false,
              placement?.rect ?? null,
              placement?.paneId ?? "",
            );
          })}
        </Box>,
        getOrCreateRuntimeRoot(),
      )}
    </Box>
  );
}

// ─── Main pane view ────────────────────────────────────────────────────────────

/** Renders the primary workspace pane with split-pane tabbed content, per-tab views, and pane visibility controls. */
export function MainPaneView() {
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const tabs = tabStore((state) => state.tabs);

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
            <LaunchView />
          </TabPanel>
        )}
      </Box>
    </Box>
  );
}
