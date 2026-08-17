import type { TabStoreStateSlice } from "./types";

/** Closes one tab and updates selected-tab pointers and per-tab metadata maps. */
export function closeTabState(
  state: TabStoreStateSlice,
  tabId: string,
  options?: { preferredSelectedTabId?: string },
): Partial<TabStoreStateSlice> | null {
  const currentTab = state.tabs.find((tab) => tab.id === tabId);
  if (!currentTab) {
    return null;
  }

  const workspaceTabs = state.tabs.filter((tab) => tab.workspaceId === currentTab.workspaceId);
  const remainingWorkspaceTabs = workspaceTabs.filter((tab) => tab.id !== tabId);
  const closedIndex = workspaceTabs.findIndex((tab) => tab.id === tabId);
  // Prefer the caller-provided tab (e.g. the remaining pane's selected tab)
  // over the workspace-wide neighbor when the closed tab was selected.
  const preferredSelectedTabId = options?.preferredSelectedTabId ?? "";
  const preferredStillExists =
    preferredSelectedTabId !== "" && remainingWorkspaceTabs.some((tab) => tab.id === preferredSelectedTabId);
  const nextSelectedTabId =
    state.selectedTabId === tabId
      ? preferredStillExists
        ? preferredSelectedTabId
        : (remainingWorkspaceTabs[closedIndex]?.id ?? remainingWorkspaceTabs[closedIndex - 1]?.id ?? "")
      : state.selectedTabId;

  return {
    tabs: state.tabs.filter((tab) => tab.id !== tabId),
    selectedTabId: nextSelectedTabId,
    selectedTabIdByWorkspaceId: {
      ...state.selectedTabIdByWorkspaceId,
      [currentTab.workspaceId]: nextSelectedTabId,
    },
  };
}

/** Closes all unpinned sibling tabs in the same workspace and keeps one tab focused. */
export function closeOtherTabsState(state: TabStoreStateSlice, tabId: string): Partial<TabStoreStateSlice> | null {
  const currentTab = state.tabs.find((tab) => tab.id === tabId);
  if (!currentTab) {
    return null;
  }

  const tabs = state.tabs.filter((tab) => tab.workspaceId !== currentTab.workspaceId || tab.id === tabId || tab.pinned);

  return {
    tabs,
    selectedTabId: tabId,
    selectedTabIdByWorkspaceId: {
      ...state.selectedTabIdByWorkspaceId,
      [currentTab.workspaceId]: tabId,
    },
  };
}

/** Closes every terminal tab across all workspaces and resets selection pointers. */
export function closeAllTerminalTabsState(
  state: TabStoreStateSlice,
  selectedWorkspaceId?: string,
): Partial<TabStoreStateSlice> | null {
  const terminalTabIds = new Set(state.tabs.filter((tab) => tab.kind === "terminal").map((tab) => tab.id));
  if (terminalTabIds.size === 0) {
    return null;
  }

  const nextTabs = state.tabs.filter((tab) => !terminalTabIds.has(tab.id));
  const nextSelectedByWorkspaceId = { ...state.selectedTabIdByWorkspaceId };
  for (const [workspaceId, tabId] of Object.entries(nextSelectedByWorkspaceId)) {
    if (terminalTabIds.has(tabId)) {
      const fallback = nextTabs.find((tab) => tab.workspaceId === workspaceId)?.id ?? "";
      nextSelectedByWorkspaceId[workspaceId] = fallback;
    }
  }
  const nextSelectedTabId = terminalTabIds.has(state.selectedTabId)
    ? (nextTabs.find((tab) => tab.workspaceId === (selectedWorkspaceId ?? ""))?.id ?? "")
    : state.selectedTabId;

  return {
    tabs: nextTabs,
    selectedTabId: nextSelectedTabId,
    selectedTabIdByWorkspaceId: nextSelectedByWorkspaceId,
  };
}

/** Closes all unpinned tabs for a workspace and selects the nearest pinned tab when needed. */
export function closeAllTabsState(state: TabStoreStateSlice, tabId: string): Partial<TabStoreStateSlice> | null {
  const currentTab = state.tabs.find((tab) => tab.id === tabId);
  if (!currentTab) {
    return null;
  }

  const tabs = state.tabs.filter((tab) => tab.workspaceId !== currentTab.workspaceId || tab.pinned);
  const selectedTabBelongsToWorkspace = state.tabs.some(
    (tab) => tab.id === state.selectedTabId && tab.workspaceId === currentTab.workspaceId,
  );
  const nextSelectedTabId = selectedTabBelongsToWorkspace
    ? (tabs.find((tab) => tab.workspaceId === currentTab.workspaceId)?.id ?? "")
    : state.selectedTabId;

  return {
    tabs,
    selectedTabId: nextSelectedTabId,
    selectedTabIdByWorkspaceId: {
      ...state.selectedTabIdByWorkspaceId,
      [currentTab.workspaceId]: nextSelectedTabId,
    },
  };
}
