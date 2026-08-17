import type { DesktopAgentKind } from "../../../helpers/agentSettings";
import type { OpenWorkspaceTabInput, WorkspaceTab } from "../model/types";
import { layoutStore } from "./layoutStore";
import { splitPaneStore } from "./splitPaneStore";
import type { CloseTabOptions } from "./tabStore";
import { tabStore } from "./tabStore";
import { workbenchNavigationStore } from "./workbenchNavigationStore";

/**
 * Workbench feature state actions — the public state-change surface for
 * Workbench State (Phase 17, desktop6.md). Cross-feature code applies Workbench
 * State changes through these functions instead of importing the Workbench
 * Stores directly. Tab/split-pane orchestration that spans backend sessions
 * stays in Workbench Commands (`tabCommands.ts`).
 */

/** Re-resolves the tab shown for one workspace after the selected workspace changed. */
export function resolveTabForWorkspace(workspaceId: string): void {
  tabStore.getState().resolveTabForWorkspace(workspaceId);
}

/** Opens one tab from a normalized tab input payload. */
export function openTab(input: OpenWorkspaceTabInput, options?: { activePaneTabIds?: string[] }): void {
  const workspaceId = input.workspaceId ?? workbenchNavigationStore.getState().activeWorkspaceId;
  if (!workspaceId) {
    return;
  }
  tabStore.getState().openTab(input, {
    workspaceId,
    activePaneTabIds: options?.activePaneTabIds,
  });
}

/** Stores one browser tab navigated URL. */
export function setBrowserTabUrl(tabId: string, url: string): void {
  tabStore.getState().setBrowserTabUrl(tabId, url);
}

/** Sets the left pane width in workspace layout state. */
export function setLeftPaneWidth(width: number): void {
  layoutStore.getState().setLeftPaneWidth(width);
}

/** Sets the right pane width in workspace layout state. */
export function setRightPaneWidth(width: number): void {
  layoutStore.getState().setRightPaneWidth(width);
}

/** Sets the manual visibility state of the left workspace pane. */
export function setIsLeftPaneManuallyHidden(hidden: boolean): void {
  layoutStore.getState().setIsLeftPaneManuallyHidden(hidden);
}

/** Selects one tab inside one pane of a workspace layout. */
export function selectPaneTab(workspaceId: string, paneId: string, tabId: string): void {
  splitPaneStore.getState().selectTab(workspaceId, paneId, tabId);
}

/** Registers one tab into its pane (auto-registration from pane views). */
export function registerTabInPane(workspaceId: string, tabId: string, paneId?: string): void {
  splitPaneStore.getState().registerTabInPane(workspaceId, tabId, paneId);
}

/** Removes one tab from its pane (tab closure or unregistration). */
export function unregisterTabFromPane(workspaceId: string, tabId: string): void {
  splitPaneStore.getState().unregisterTabFromPane(workspaceId, tabId);
}

/** Splits one workspace pane and places one tab in the new pane. */
export function splitPane(
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

/** Records the bound backend session id on one terminal tab. */
export function setTerminalTabSessionId(tabId: string, sessionId: string): void {
  tabStore.getState().setTerminalTabSessionId(tabId, sessionId);
}

/** Records the agent kind bound to one terminal tab. */
export function setTerminalTabAgentKind(tabId: string, agentKind: DesktopAgentKind | undefined): void {
  tabStore.getState().setTerminalTabAgentKind(tabId, agentKind);
}

/** Renames one tab title. */
export function renameTab(tabId: string, title: string, options?: { userRenamed?: boolean }): void {
  tabStore.getState().renameTab(tabId, title, options);
}

/** Closes one tab. */
export function closeTab(tabId: string, options?: CloseTabOptions): void {
  if (options) {
    tabStore.getState().closeTab(tabId, options);
  } else {
    tabStore.getState().closeTab(tabId);
  }
}

/** Records the bound backend session id on one agent-chat tab. */
export function setAgentChatTabSession(input: { tabId: string; sessionId: string }): void {
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

/** Selects one tab in the tab store. */
export function selectTab(tabId: string): void {
  tabStore.getState().selectTab(tabId);
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

/** Closes all terminal tabs. */
export function closeAllTerminalTabs(workspaceId?: string): void {
  const targetWorkspaceId = workspaceId ?? workbenchNavigationStore.getState().activeWorkspaceId;
  tabStore.getState().closeAllTerminalTabs(targetWorkspaceId);
}

/** Sets the link-open target preference. */
export function setLinkTarget(target: "built-in" | "external"): void {
  layoutStore.getState().setLinkTarget(target);
}

/** Sets the markdown theme preference. */
export function setMarkdownThemePreference(preference: "inherit" | "light" | "dark"): void {
  layoutStore.getState().setMarkdownThemePreference(preference);
}

/** Sets the markdown preview font size. */
export function setMarkdownPreviewFontSize(size: "small" | "medium" | "large"): void {
  layoutStore.getState().setMarkdownPreviewFontSize(size);
}

/** Sets the markdown preview width. */
export function setMarkdownPreviewWidth(width: "readable" | "full"): void {
  layoutStore.getState().setMarkdownPreviewWidth(width);
}

/** Sets the markdown outline visibility. */
export function setIsMarkdownOutlineVisible(visible: boolean): void {
  layoutStore.getState().setIsMarkdownOutlineVisible(visible);
}
