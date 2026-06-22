import {
  closeWorkspacePaneStoreTab,
  getActivePaneTabFromWorkspacePaneStoreState,
  selectWorkspacePaneStoreTab,
} from "../state/shell-pane-layout-helpers";
import type { WorkspacePaneStoreState } from "../state/shell.types";
import { workspacePaneStoreStatesEqual } from "../state/shellPaneStoreEquality";

type ClosePaneTabStoreMutation = {
  nextStoreState: WorkspacePaneStoreState;
  shouldSyncRoute: boolean;
};

export function buildSelectPaneTabStoreMutation(
  storeState: WorkspacePaneStoreState,
  activePaneTabId: string | null,
  tabId: string,
): WorkspacePaneStoreState | null {
  if (activePaneTabId === tabId) {
    return null;
  }

  const nextStoreState = selectWorkspacePaneStoreTab(storeState, tabId);
  return workspacePaneStoreStatesEqual(storeState, nextStoreState) ? null : nextStoreState;
}

export function buildClosePaneTabStoreMutation(
  storeState: WorkspacePaneStoreState,
  tabId: string,
): ClosePaneTabStoreMutation | null {
  const currentActiveTabId = getActivePaneTabFromWorkspacePaneStoreState(storeState)?.id ?? null;
  const nextStoreState = closeWorkspacePaneStoreTab(storeState, tabId);
  if (workspacePaneStoreStatesEqual(storeState, nextStoreState)) {
    return null;
  }

  return {
    nextStoreState,
    shouldSyncRoute: currentActiveTabId === tabId,
  };
}
