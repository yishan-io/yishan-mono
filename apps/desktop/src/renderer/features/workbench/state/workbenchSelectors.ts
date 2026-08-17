import { findLeaf, findLeafByTabId } from "../model/split-pane/operations";
import type { PaneLeaf, SplitPaneStateSlice } from "../model/split-pane/types";
import type { WorkspaceTab } from "../model/types";
import type { TabStoreState } from "./tabStore";

/**
 * Workbench feature selectors — pure functions from Workbench State to values
 * (desktop-renderer-refactor-rules.md). They take State as an argument and
 * never call `getState()`. Subscribe in React with `tabStore(selectTabs)` or
 * read imperatively with `selectTabs(tabStore.getState())`.
 */

/** Reads the manual visibility state of the left workspace pane. */
export const selectIsLeftPaneManuallyHidden = (state: {
  isLeftPaneManuallyHidden: boolean;
}): boolean => state.isLeftPaneManuallyHidden;

/** Reads the currently selected tab id. */
export const selectSelectedTabId = (state: TabStoreState): string => state.selectedTabId;

/** Reads all workspace tabs. */
export const selectTabs = (state: TabStoreState): WorkspaceTab[] => state.tabs;

/** Reads one tab by id. */
export const selectTabById =
  (tabId: string) =>
  (state: TabStoreState): WorkspaceTab | undefined =>
    state.tabs.find((tab) => tab.id === tabId);

/** Reads the split-pane layout of one workspace. */
export const selectLayoutByWorkspaceId =
  (workspaceId: string) =>
  (state: { layoutByWorkspaceId: Record<string, SplitPaneStateSlice> }): SplitPaneStateSlice | undefined =>
    state.layoutByWorkspaceId[workspaceId];

/** Reads the active pane of one workspace layout. */
export const selectActivePane =
  (workspaceId: string) =>
  (state: { layoutByWorkspaceId: Record<string, SplitPaneStateSlice> }): PaneLeaf | null => {
    const layout = state.layoutByWorkspaceId[workspaceId];
    return layout ? findLeaf(layout.root, layout.activePaneId) : null;
  };

/** Reads one pane of a workspace layout. */
export const selectPane =
  (workspaceId: string, paneId: string) =>
  (state: { layoutByWorkspaceId: Record<string, SplitPaneStateSlice> }): PaneLeaf | null => {
    const layout = state.layoutByWorkspaceId[workspaceId];
    return layout ? findLeaf(layout.root, paneId) : null;
  };

/** Reads the pane that currently hosts one tab. */
export const selectPaneForTab =
  (workspaceId: string, tabId: string) =>
  (state: { layoutByWorkspaceId: Record<string, SplitPaneStateSlice> }): PaneLeaf | null => {
    const layout = state.layoutByWorkspaceId[workspaceId];
    return layout ? findLeafByTabId(layout.root, tabId) : null;
  };
