import { closeAllTabsState, closeAllTerminalTabsState, closeOtherTabsState, closeTabState } from "./close";
import {
  markFileTabSavedState,
  refreshDiffTabContentState,
  refreshFileTabFromDiskState,
  renameTabsForEntryRenameState,
  renameTabState,
  reorderTabState,
  toggleTabPinnedState,
  updateFileTabContentState,
} from "./layout";
import { openTabState } from "./open";
import { createSessionTabOptimisticState, failSessionTabInitState, resolveSessionTabState } from "./session";

export {
  closeAllTabsState,
  closeAllTerminalTabsState,
  closeOtherTabsState,
  closeTabState,
  createSessionTabOptimisticState,
  markFileTabSavedState,
  failSessionTabInitState,
  openTabState,
  refreshDiffTabContentState,
  refreshFileTabFromDiskState,
  renameTabsForEntryRenameState,
  renameTabState,
  reorderTabState,
  resolveSessionTabState,
  toggleTabPinnedState,
  updateFileTabContentState,
};

export type { WorkspaceTabStateSlice } from "./types";
