import type { WorkspaceTab } from "../model/types";
import { layoutStore } from "./layoutStore";
import { splitPaneStore } from "./splitPaneStore";
import { tabStore } from "./tabStore";

/**
 * Workbench feature selectors — the public read surface for Workbench State
 * (Phase 17, desktop6.md). Cross-feature code reads Workbench State through
 * these functions instead of importing the Workbench Stores directly.
 */

/** Reads the manual visibility state of the left workspace pane. */
export function selectIsLeftPaneManuallyHidden(): boolean {
  return layoutStore.getState().isLeftPaneManuallyHidden;
}

/** Reads the currently selected tab id. */
export function selectSelectedTabId(): string {
  return tabStore.getState().selectedTabId;
}

/** Reads all workspace tabs. */
export function selectTabs(): WorkspaceTab[] {
  return tabStore.getState().tabs;
}

/** Reads one tab by id. */
export function selectTabById(tabId: string): WorkspaceTab | undefined {
  return tabStore.getState().tabs.find((tab) => tab.id === tabId);
}

/** Reads the split-pane layout for one workspace. */
export function selectLayout(workspaceId: string) {
  return splitPaneStore.getState().getLayout(workspaceId);
}

/** Reads the active pane of one workspace layout. */
export function selectActivePane(workspaceId: string) {
  return splitPaneStore.getState().getActivePane(workspaceId);
}

/** Reads one pane of a workspace layout. */
export function selectPane(workspaceId: string, paneId: string) {
  return splitPaneStore.getState().getPane(workspaceId, paneId);
}

/** Reads the pane that currently hosts one tab. */
export function selectPaneForTab(workspaceId: string, tabId: string) {
  return splitPaneStore.getState().getPaneForTab(workspaceId, tabId);
}
