/**
 * WorkbenchCommands — the public command surface for the Workbench feature
 * (tabs, panes, and split-pane coordination).
 *
 * Phase 1 contract. Owned by `tabCommands`; the Workbench root API
 * re-exports the presentation-only commands (desktop6-adjust.md W5).
 */
import type * as tabCommands from "./tabCommands";

export type WorkbenchCommands = {
  createTab: typeof tabCommands.createTab;
  closeTab: typeof tabCommands.closeTab;
  closeOtherTabs: typeof tabCommands.closeOtherTabs;
  closeAllTabs: typeof tabCommands.closeAllTabs;
  setSelectedTab: typeof tabCommands.setSelectedTab;
  openTab: typeof tabCommands.openTab;
  openTabInOppositePane: typeof tabCommands.openTabInOppositePane;
  toggleTabPinned: typeof tabCommands.toggleTabPinned;
  promoteTemporaryTab: typeof tabCommands.promoteTemporaryTab;
  reorderTab: typeof tabCommands.reorderTab;
  renameTab: typeof tabCommands.renameTab;
  setBrowserTabFaviconUrl: typeof tabCommands.setBrowserTabFaviconUrl;
  setBrowserTabUrl: typeof tabCommands.setBrowserTabUrl;
  resolveTabForWorkspace: typeof tabCommands.resolveTabForWorkspace;
  bindTerminalTabSession: typeof tabCommands.bindTerminalTabSession;
  setTerminalTabAgentKind: typeof tabCommands.setTerminalTabAgentKind;
  bindAgentChatTabSession: typeof tabCommands.bindAgentChatTabSession;
  setAgentChatTabSubagentControl: typeof tabCommands.setAgentChatTabSubagentControl;
  closeAllTerminalTabs: typeof tabCommands.closeAllTerminalTabs;
  paneSelectTab: typeof tabCommands.paneSelectTab;
  registerTabInPane: typeof tabCommands.registerTabInPane;
  unregisterTabFromPane: typeof tabCommands.unregisterTabFromPane;
  splitWorkspacePane: typeof tabCommands.splitWorkspacePane;
  moveTabToPane: typeof tabCommands.moveTabToPane;
  reorderPaneTab: typeof tabCommands.reorderPaneTab;
  setActivePane: typeof tabCommands.setActivePane;
  updateSplitRatio: typeof tabCommands.updateSplitRatio;
  createAdjacentPaneWithTab: typeof tabCommands.createAdjacentPaneWithTab;
  resizeLeftPane: typeof tabCommands.resizeLeftPane;
  resizeRightPane: typeof tabCommands.resizeRightPane;
  setLeftPaneHidden: typeof tabCommands.setLeftPaneHidden;
  setRightPaneTab: typeof tabCommands.setRightPaneTab;
  setIsRightPaneHidden: typeof tabCommands.setIsRightPaneHidden;
  removeRightPaneStateForWorkspace: typeof tabCommands.removeRightPaneStateForWorkspace;
  renameTabsForEntryRename: typeof tabCommands.renameTabsForEntryRename;
  updateFileTabContent: typeof tabCommands.updateFileTabContent;
  markFileTabSaved: typeof tabCommands.markFileTabSaved;
  refreshFileTabFromDisk: typeof tabCommands.refreshFileTabFromDisk;
  refreshDiffTabContent: typeof tabCommands.refreshDiffTabContent;
};
