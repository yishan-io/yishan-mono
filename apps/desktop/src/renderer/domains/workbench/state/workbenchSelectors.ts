import { findLeaf, findLeafByTabId } from "../model/split-pane/operations";
import type { PaneLeaf, SplitPaneStateSlice } from "../model/split-pane/types";

/**
 * Workbench feature selectors — pure functions from State to values
 * (desktop-renderer-refactor-rules.md). They take State as an argument and
 * never call `getState()`. React code subscribes with `tabStore((state) =>
 * selectActivePane(state, workspaceId))`; non-React code passes a snapshot.
 *
 * Only pane queries that hide split-pane tree structure are named. Trivial
 * reads (selected tab id, tab list) stay inline at the call site.
 */

/** Reads the split-pane layout of one workspace. */
export function selectLayoutByWorkspaceId(
  state: { layoutByWorkspaceId: Record<string, SplitPaneStateSlice> },
  workspaceId: string,
): SplitPaneStateSlice | undefined {
  return state.layoutByWorkspaceId[workspaceId];
}

/** Reads the active pane of one workspace layout. */
export function selectActivePane(
  state: { layoutByWorkspaceId: Record<string, SplitPaneStateSlice> },
  workspaceId: string,
): PaneLeaf | null {
  const layout = state.layoutByWorkspaceId[workspaceId];
  return layout ? findLeaf(layout.root, layout.activePaneId) : null;
}

/** Reads one pane of a workspace layout. */
export function selectPane(
  state: { layoutByWorkspaceId: Record<string, SplitPaneStateSlice> },
  workspaceId: string,
  paneId: string,
): PaneLeaf | null {
  const layout = state.layoutByWorkspaceId[workspaceId];
  return layout ? findLeaf(layout.root, paneId) : null;
}

/** Reads the pane that currently hosts one tab. */
export function selectPaneForTab(
  state: { layoutByWorkspaceId: Record<string, SplitPaneStateSlice> },
  workspaceId: string,
  tabId: string,
): PaneLeaf | null {
  const layout = state.layoutByWorkspaceId[workspaceId];
  return layout ? findLeafByTabId(layout.root, tabId) : null;
}
