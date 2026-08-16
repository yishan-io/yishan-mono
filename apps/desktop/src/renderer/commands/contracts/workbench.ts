/**
 * WorkbenchCommands — the public command surface for the Workbench feature
 * (tabs, panes, and split-pane coordination).
 *
 * Phase 1 contract. Owned by `tabCommands`, `whiteboardCommands`, and
 * `workspaceTabSync` today; moves to `features/workbench/commands/` in
 * Phase 6.
 */
import type * as tabCommands from "../tabCommands";
import type * as whiteboardCommands from "../whiteboardCommands";
import type * as workspaceTabSync from "../workspaceTabSync";

export type WorkbenchCommands = {
  createTab: typeof tabCommands.createTab;
  closeTab: typeof tabCommands.closeTab;
  closeOtherTabs: typeof tabCommands.closeOtherTabs;
  closeAllTabs: typeof tabCommands.closeAllTabs;
  setSelectedTab: typeof tabCommands.setSelectedTab;
  openTab: typeof tabCommands.openTab;
  openChatFileTab: typeof tabCommands.openChatFileTab;
  openTabInOppositePane: typeof tabCommands.openTabInOppositePane;
  toggleTabPinned: typeof tabCommands.toggleTabPinned;
  promoteTemporaryTab: typeof tabCommands.promoteTemporaryTab;
  reorderTab: typeof tabCommands.reorderTab;
  renameTab: typeof tabCommands.renameTab;
  setBrowserTabFaviconUrl: typeof tabCommands.setBrowserTabFaviconUrl;
  setBrowserTabUrl: typeof tabCommands.setBrowserTabUrl;
  renameTabsForEntryRename: typeof tabCommands.renameTabsForEntryRename;
  updateFileTabContent: typeof tabCommands.updateFileTabContent;
  markFileTabSaved: typeof tabCommands.markFileTabSaved;
  refreshFileTabFromDisk: typeof tabCommands.refreshFileTabFromDisk;
  refreshDiffTabContent: typeof tabCommands.refreshDiffTabContent;
  createNewWhiteboard: typeof whiteboardCommands.createNewWhiteboard;
  resolveNextWhiteboardPath: typeof whiteboardCommands.resolveNextWhiteboardPath;
  syncTabStoreWithWorkspace: typeof workspaceTabSync.syncTabStoreWithWorkspace;
};
