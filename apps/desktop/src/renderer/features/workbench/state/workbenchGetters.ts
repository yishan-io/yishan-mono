import type { PaneLeaf } from "../model/split-pane/types";
import type { WorkspaceTab } from "../model/types";
import { layoutStore } from "./layoutStore";
import { splitPaneStore } from "./splitPaneStore";
import { tabStore } from "./tabStore";

/**
 * Workbench imperative snapshot reads (Getters) — desktop-renderer-refactor-rules.md.
 * A Getter is an internal State adapter for non-React callers (commands,
 * runtimes, event handlers). Use pure Selectors for React subscriptions and
 * prefer Selectors over Getters wherever possible.
 */

/** Reads all workspace tabs. */
export function getTabs(): WorkspaceTab[] {
  return tabStore.getState().tabs;
}

/** Reads one tab by id. */
export function getTabById(tabId: string): WorkspaceTab | undefined {
  return tabStore.getState().tabs.find((tab) => tab.id === tabId);
}

/** Reads the currently selected tab id. */
export function getSelectedTabId(): string {
  return tabStore.getState().selectedTabId;
}

/** Reads the manual visibility state of the left workspace pane. */
export function getIsLeftPaneManuallyHidden(): boolean {
  return layoutStore.getState().isLeftPaneManuallyHidden;
}

/** Reads the split-pane layout of one workspace. */
export function getLayout(workspaceId: string) {
  return splitPaneStore.getState().getLayout(workspaceId);
}

/** Reads the active pane of one workspace layout. */
export function getActivePane(workspaceId: string): PaneLeaf | null {
  return splitPaneStore.getState().getActivePane(workspaceId);
}

/** Reads one pane of a workspace layout. */
export function getPane(workspaceId: string, paneId: string): PaneLeaf | null {
  return splitPaneStore.getState().getPane(workspaceId, paneId);
}

/** Reads the pane that currently hosts one tab. */
export function getPaneForTab(workspaceId: string, tabId: string): PaneLeaf | null {
  return splitPaneStore.getState().getPaneForTab(workspaceId, tabId);
}
