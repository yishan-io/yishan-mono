/**
 * Workbench feature public API (Phase 12, desktop5.md).
 */
export type { WorkbenchCommands } from "./commands/contract";
export {
  activateProject,
  activateWorkspace,
  closeOverlayPanel,
  openOverlayPanel,
} from "./commands/navigationCommands";
export {
  bindAgentChatTabSession,
  bindTerminalTabSession,
  closeAllTabs,
  closeAllTerminalTabs,
  closeOtherTabs,
  createAdjacentPaneWithTab,
  moveTabToPane,
  closeTab,
  openTab,
  openTabInOppositePane,
  paneSelectTab,
  registerTabInPane,
  removeRightPaneStateForWorkspace,
  renameTab,
  reorderPaneTab,
  resizeLeftPane,
  resizeRightPane,
  resolveTabForWorkspace,
  retainWorkspaceTabs,
  setActivePane,
  setAgentChatTabSubagentControl,
  setLeftPaneHidden,
  setIsRightPaneHidden,
  setRightPaneTab,
  setSelectedTab,
  setTerminalTabAgentKind,
  splitWorkspacePane,
  unregisterTabFromPane,
} from "./commands/tabCommands";
export type { WorkspaceTab } from "./model/types";
export type { TabStoreState } from "./state/tabStore";
export {
  workbenchNavigationStore,
  type OverlayPanel,
  type WorkbenchNavigationState,
} from "./state/workbenchNavigationStore";
export {
  layoutStore,
  type WorkspaceRightPaneTab,
  DEFAULT_RIGHT_PANE_TAB,
  type LayoutStoreState,
} from "./state/layoutStore";
export {
  getActivePane,
  getIsLeftPaneManuallyHidden,
  getLayout,
  getPane,
  getPaneForTab,
  getSelectedTabId,
  getTabById,
  getTabs,
} from "./state/workbenchGetters";
export type {
  LinkTarget,
  MarkdownPreviewFontSize,
  MarkdownPreviewWidth,
  MarkdownThemePreference,
} from "./state/layoutStore";

// Stable UI entry points for cross-feature composition (Phase 18).
export { BrowserView } from "./ui/browser/BrowserView";
export { reloadWebview, removeWebviewsForClosedTabs } from "./ui/browser/webviewRegistry";
export { WorkspaceSplitPane } from "./ui/WorkspaceSplitPaneView";
export { useSelectedTabId } from "./ui/hooks/useWorkbenchTabs";
export { WorkspaceTabSurfaceLayer } from "./ui/WorkspaceTabSurfaceLayer";
export { type WorkspaceTabPlacement, useWorkspaceTabPlacements } from "./ui/useWorkspaceTabPlacements";
