import { normalizePaneLayoutState } from "@/features/shell/state/shell-pane-layout-helpers";
import { createEmptyWorkspacePaneStoreState } from "@/features/shell/state/shell-state-helpers";
import type { WorkspacePaneStoreState } from "@/features/shell/state/shell.types";

function normalizeWorkspacePaneStoreScope(
  storeState: WorkspacePaneStoreState,
  workspaceId: string,
): WorkspacePaneStoreState {
  const nextTabs = storeState.tabState.tabs.filter((tab) => tab.workspaceId === workspaceId);
  const nextSelectedTabId = nextTabs.some((tab) => tab.id === storeState.tabState.selectedTabId)
    ? storeState.tabState.selectedTabId
    : (nextTabs[0]?.id ?? "");

  if (
    storeState.tabState.workspaceId === workspaceId &&
    nextTabs.length === storeState.tabState.tabs.length &&
    nextSelectedTabId === storeState.tabState.selectedTabId
  ) {
    return storeState;
  }

  const nextTabState = {
    ...storeState.tabState,
    selectedTabId: nextSelectedTabId,
    tabs: nextTabs,
    workspaceId,
  };

  return {
    layoutState: normalizePaneLayoutState(nextTabState, storeState.layoutState),
    tabState: nextTabState,
  };
}

export function sanitizeWorkspacePaneStoreState(
  storeState: WorkspacePaneStoreState | null | undefined,
  workspaceId: string,
): WorkspacePaneStoreState {
  const currentStoreState = storeState ?? createEmptyWorkspacePaneStoreState(workspaceId);
  return normalizeWorkspacePaneStoreScope(currentStoreState, workspaceId);
}
