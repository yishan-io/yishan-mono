import { closeAllTabsState, closeAllTerminalTabsState, closeOtherTabsState, closeTabState } from "./close";
import {
  promoteTemporaryTabState,
  renameTabState,
  renameTabsForEntryRenameState,
  reorderTabState,
  setFileTabDirtyState,
  toggleTabPinnedState,
} from "./layout";
import { openTabState } from "./open";

export {
  closeAllTabsState,
  closeAllTerminalTabsState,
  closeOtherTabsState,
  closeTabState,
  openTabState,
  promoteTemporaryTabState,
  renameTabsForEntryRenameState,
  renameTabState,
  reorderTabState,
  setFileTabDirtyState,
  toggleTabPinnedState,
};

export type { TabStoreStateSlice } from "./types";
