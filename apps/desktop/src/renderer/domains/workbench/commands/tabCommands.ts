import type { DesktopAgentKind } from "@renderer/domains/agent";
import {
  collectLeaves,
  findOppositePaneId,
  removeTabFromPane,
  splitRootPane,
} from "../../../domains/workbench/split-pane";
import { type WorkspaceRightPaneTab, layoutStore } from "../../../domains/workbench/state/layoutStore";
import { createPaneId, splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import type { CloseTabOptions, TabStoreState } from "../../../domains/workbench/state/tabStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workbenchNavigationStore } from "../../../domains/workbench/state/workbenchNavigationStore";
import type { OpenTabInput } from "../../../domains/workbench/tabs";
import { type TabFocusKind, type TabFocusTarget, requestTabFocus } from "../runtime/tabFocusIntent";

type TabStoreFacade = typeof tabStore & {
  getState?: () => TabStoreState;
};

/** Reads tab store state for both real Zustand stores and selector-only test doubles. */
export function readTabStoreState(): TabStoreState {
  const facade = tabStore as TabStoreFacade;
  if (typeof facade.getState === "function") {
    return facade.getState();
  }

  return (tabStore as unknown as (selector: (state: TabStoreState) => TabStoreState) => TabStoreState)(
    (state) => state,
  );
}

/** Resolves the active workspace id when a command does not carry one. */
function resolveActiveWorkspaceId(input?: { workspaceId?: string }): string | undefined {
  return input?.workspaceId ?? workbenchNavigationStore.getState().activeWorkspaceId;
}

/**
 * Derives the tab that should remain selected after closing `tabId`, based on the
 * split-pane layout: the tab the surviving/active pane will select.
 *
 * Uses the pure `removeTabFromPane` so the command mirrors exactly what the pane
 * layer computes when it unregisters the tab (pane-local neighbor, or the
 * remaining pane's selection after a collapse). Returns undefined when there is
 * no layout or the tab is not placed in one yet (falls back to the neighbor rule).
 */
function resolvePreferredSelectionAfterClose(workspaceId: string, tabId: string): string | undefined {
  const layout = splitPaneStore.getState().layoutByWorkspaceId[workspaceId];
  if (!layout) {
    return undefined;
  }
  const nextLayout = removeTabFromPane(layout, tabId);
  if (!nextLayout) {
    return undefined;
  }
  const nextActivePane = collectLeaves(nextLayout.root).find((pane) => pane.id === nextLayout.activePaneId);
  return nextActivePane?.selectedTabId || undefined;
}

/** Closes one tab and requests backend session closure when needed. */
export function closeTab(tabId: string, options?: CloseTabOptions): void {
  const snapshot = readTabStoreState();
  const tab = snapshot.tabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    return;
  }

  // Pane-aware preference: the ✕-button path passes the surviving pane's selected
  // tab explicitly (the tab is already unregistered by then); keyboard/menu paths
  // get it derived from the layout here. Without a preference, `closeTabState`
  // falls back to its workspace-wide neighbor rule.
  const preferredSelectedTabId =
    options?.preferredSelectedTabId ?? resolvePreferredSelectionAfterClose(tab.workspaceId, tabId);
  if (preferredSelectedTabId) {
    snapshot.closeTab(tabId, { preferredSelectedTabId });
  } else {
    snapshot.closeTab(tabId);
  }
}

/** Closes unpinned sibling tabs for one workspace and closes associated backend sessions. */
export function closeOtherTabs(tabId: string): void {
  const snapshot = readTabStoreState();
  const target = snapshot.tabs.find((tab) => tab.id === tabId);
  if (!target) {
    return;
  }

  snapshot.closeOtherTabs(tabId);
}

/** Closes all unpinned tabs for one workspace and closes associated backend sessions. */
export function closeAllTabs(tabId: string): void {
  const snapshot = readTabStoreState();
  const target = snapshot.tabs.find((tab) => tab.id === tabId);
  if (!target) {
    return;
  }

  snapshot.closeAllTabs(tabId);
}

/** Sets one selected tab id in tab store state. */
export function setSelectedTab(tabId: string) {
  readTabStoreState().selectTab(tabId);
}

/** Requests focus on the next frame for an eligible tab created by the current open-tab operation. */
function requestFocusForNewTab(previousTabIds: Set<string>): void {
  const snapshot = readTabStoreState();
  const selectedTab = snapshot.tabs.find((tab) => tab.id === snapshot.selectedTabId);
  if (!selectedTab || previousTabIds.has(selectedTab.id)) {
    return;
  }

  const focusRequest: { target: TabFocusTarget; kind: TabFocusKind } | undefined =
    selectedTab.kind === "terminal"
      ? { target: "terminal", kind: "auto" }
      : selectedTab.kind === "agent-chat" && selectedTab.data.sessionView !== "subagent-detail"
        ? { target: "agent-composer", kind: "auto" }
        : undefined;
  if (!focusRequest) {
    return;
  }

  window.requestAnimationFrame(() => {
    const createdTabStillExists = readTabStoreState().tabs.some((tab) => tab.id === selectedTab.id);
    if (!createdTabStillExists) {
      return;
    }

    requestTabFocus(selectedTab.id, focusRequest.target, focusRequest.kind);
  });
}

/** Opens one tab from one normalized tab input payload. */
export function openTab(input: OpenTabInput, options?: { activePaneTabIds?: string[] }) {
  const snapshot = readTabStoreState();
  const previousTabIds = new Set(snapshot.tabs.map((tab) => tab.id));
  const workspaceId = resolveActiveWorkspaceId(input);
  if (!workspaceId) {
    return;
  }
  const activePane = splitPaneStore.getState().getActivePane(workspaceId);
  snapshot.openTab(input, { workspaceId, activePaneTabIds: options?.activePaneTabIds ?? activePane?.tabIds });
  requestFocusForNewTab(previousTabIds);
}

/**
 * Opens a tab in the opposite pane (cmd+click behavior):
 * - If no split exists, creates a horizontal split and opens the tab in the new pane.
 * - If a split exists, opens the tab in the pane opposite to the current active one.
 *
 * The split pane layout is updated first, then the tab is opened.
 * The auto-registration in `WorkspaceSplitPaneView` picks up the correct target pane
 * because it reads the current `activePaneId` after the split is already in place.
 */
export function openTabInOppositePane(input: OpenTabInput): void {
  const workspaceId = input.workspaceId ?? workbenchNavigationStore.getState().activeWorkspaceId;
  if (!workspaceId) {
    return;
  }

  // Step 1: Ensure the split exists and determine the target pane
  const layout = splitPaneStore.getState().layoutByWorkspaceId[workspaceId];

  if (layout) {
    const oppositeId = findOppositePaneId(layout.root, layout.activePaneId);
    if (oppositeId) {
      // Split exists — set active pane to the opposite one so the auto-registration
      // hooks in WorkspaceSplitPaneView pick the right pane
      splitPaneStore.getState().setActivePane(workspaceId, oppositeId);
    } else if (layout.root.kind === "leaf") {
      // No split yet — create one with the new pane as second (right/bottom)
      const next = splitRootPane(layout, "horizontal", createPaneId(), createPaneId());
      if (!next) {
        // Fallback to normal open
        openTab(input);
        return;
      }
      splitPaneStore.setState({
        layoutByWorkspaceId: {
          ...splitPaneStore.getState().layoutByWorkspaceId,
          [workspaceId]: next,
        },
      });
    } else {
      // Fallback to normal open
      openTab(input);
      return;
    }
  } else {
    // Fallback to normal open
    openTab(input);
    return;
  }

  const activePane = splitPaneStore.getState().getActivePane(workspaceId);
  const previousTabIds = new Set(readTabStoreState().tabs.map((tab) => tab.id));

  // Step 2: Open the tab — WorkspaceSplitPaneView's auto-registration effect will
  // place it in the current active pane (which is now the target opposite pane)
  readTabStoreState().openTab(input, { workspaceId, activePaneTabIds: activePane?.tabIds });
  requestFocusForNewTab(previousTabIds);
}

/** Toggles pinned state for one tab id. */
export function toggleTabPinned(tabId: string) {
  readTabStoreState().toggleTabPinned(tabId);
}

/** Promotes a temporary tab to permanent (non-temporary) state. */
export function promoteTemporaryTab(tabId: string) {
  readTabStoreState().promoteTemporaryTab(tabId);
}

/** Reorders one tab relative to one target tab position. */
export function reorderTab(draggedTabId: string, targetTabId: string, position: "before" | "after") {
  readTabStoreState().reorderTab(draggedTabId, targetTabId, position);
}

/** Renames one tab title. */
export function renameTab(tabId: string, title: string, options?: { userRenamed?: boolean }) {
  readTabStoreState().renameTab(tabId, title, options);
}

/** Stores one browser tab favicon URL. */
export function setBrowserTabFaviconUrl(tabId: string, faviconUrl: string | undefined) {
  readTabStoreState().setBrowserTabFaviconUrl(tabId, faviconUrl);
}

/** Persists the current navigated URL on a browser tab. */
export function setBrowserTabUrl(tabId: string, url: string) {
  readTabStoreState().setBrowserTabUrl(tabId, url);
}

/** Applies a file-tree rename mapping to related open tabs. */
export function renameTabsForEntryRename(workspaceId: string, fromPath: string, toPath: string) {
  readTabStoreState().renameTabsForEntryRename(workspaceId, fromPath, toPath);
}

/** Syncs the dirty presentation flag on one file tab (content lives in Files state). */
export function setFileTabDirty(tabId: string, isDirty: boolean): void {
  tabStore.getState().setFileTabDirty(tabId, isDirty);
}

/** Retains only tabs that belong to the provided workspace ids; returns the removed tab ids. */
export function retainWorkspaceTabs(workspaceIds: string[]): string[] {
  const activeWorkspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
  return tabStore.getState().retainWorkspaceTabs(workspaceIds, activeWorkspaceId);
}

/** Re-resolves the tab shown for one workspace after the selected workspace changed. */
export function resolveTabForWorkspace(workspaceId: string): void {
  tabStore.getState().resolveTabForWorkspace(workspaceId);
}

/** Records the bound backend session id on one terminal tab. */
export function bindTerminalTabSession(tabId: string, sessionId: string): void {
  tabStore.getState().setTerminalTabSessionId(tabId, sessionId);
}

/** Records the agent kind bound to one terminal tab. */
export function setTerminalTabAgentKind(tabId: string, agentKind: DesktopAgentKind | undefined): void {
  tabStore.getState().setTerminalTabAgentKind(tabId, agentKind);
}

/** Records the bound backend session id on one agent-chat tab. */
export function bindAgentChatTabSession(input: { tabId: string; sessionId: string }): void {
  tabStore.getState().setAgentChatTabSession(input);
}

/** Records subagent control metadata on one agent-chat tab. */
export function setAgentChatTabSubagentControl(input: {
  tabId: string;
  agentId?: string;
  parentSessionId?: string;
}): void {
  tabStore.getState().setAgentChatTabSubagentControl(input);
}

/** Closes all terminal tabs. */
export function closeAllTerminalTabs(workspaceId?: string): void {
  const targetWorkspaceId = workspaceId ?? workbenchNavigationStore.getState().activeWorkspaceId;
  tabStore.getState().closeAllTerminalTabs(targetWorkspaceId);
}

/** Selects one tab inside one pane of a workspace layout. */
export function paneSelectTab(workspaceId: string, paneId: string, tabId: string): void {
  splitPaneStore.getState().selectTab(workspaceId, paneId, tabId);
}

/** Registers one tab into its pane (auto-registration from pane views). */
export function registerTabInPane(workspaceId: string, tabId: string, paneId?: string): void {
  splitPaneStore.getState().registerTabInPane(workspaceId, tabId, paneId);
}

/** Removes one tab from its pane. */
export function unregisterTabFromPane(workspaceId: string, tabId: string): void {
  splitPaneStore.getState().unregisterTabFromPane(workspaceId, tabId);
}

/** Splits one workspace pane and places one tab in the new pane. */
export function splitWorkspacePane(
  workspaceId: string,
  input: {
    tabId: string;
    targetPaneId: string;
    direction: "horizontal" | "vertical";
    placement: "first" | "second";
  },
): void {
  splitPaneStore.getState().splitPane(workspaceId, input);
}

/** Moves one tab into another pane of the same workspace layout. */
export function moveTabToPane(workspaceId: string, tabId: string, targetPaneId: string): void {
  splitPaneStore.getState().moveTab(workspaceId, tabId, targetPaneId);
}

/** Reorders one tab relative to one target tab inside one pane. */
export function reorderPaneTab(
  workspaceId: string,
  paneId: string,
  draggedTabId: string,
  targetTabId: string,
  position: "before" | "after",
): void {
  splitPaneStore.getState().reorderTab(workspaceId, paneId, draggedTabId, targetTabId, position);
}

/** Sets the active pane of one workspace layout. */
export function setActivePane(workspaceId: string, paneId: string): void {
  splitPaneStore.getState().setActivePane(workspaceId, paneId);
}

/** Updates the split ratio of one pane branch in a workspace layout. */
export function updateSplitRatio(workspaceId: string, branchId: string, ratio: number): void {
  splitPaneStore.getState().updateSplitRatio(workspaceId, branchId, ratio);
}

/** Creates one adjacent pane with one tab in a workspace layout. */
export function createAdjacentPaneWithTab(
  workspaceId: string,
  input: {
    tabId: string;
    targetPaneId: string;
    direction: "horizontal" | "vertical";
    placement: "first" | "second";
  },
): void {
  splitPaneStore.getState().createAdjacentPaneWithTab(workspaceId, input);
}

/** Sets the left pane width in workspace layout state. */
export function resizeLeftPane(width: number): void {
  layoutStore.getState().setLeftPaneWidth(width);
}

/** Sets the right pane width in workspace layout state. */
export function resizeRightPane(width: number): void {
  layoutStore.getState().setRightPaneWidth(width);
}

/** Sets the manual visibility state of the left workspace pane. */
export function setLeftPaneHidden(hidden: boolean): void {
  layoutStore.getState().setIsLeftPaneManuallyHidden(hidden);
}

/** Sets the selected right-pane tab for one workspace. */
export function setRightPaneTab(workspaceId: string, tab: WorkspaceRightPaneTab): void {
  layoutStore.getState().setRightPaneTab(workspaceId, tab);
}

/** Sets the manual visibility state of the right pane for one workspace. */
export function setIsRightPaneHidden(workspaceId: string, hidden: boolean): void {
  layoutStore.getState().setIsRightPaneHidden(workspaceId, hidden);
}

/** Removes per-workspace right-pane state when a workspace closes. */
export function removeRightPaneStateForWorkspace(workspaceId: string): void {
  layoutStore.getState().removeRightPaneStateForWorkspace(workspaceId);
}
