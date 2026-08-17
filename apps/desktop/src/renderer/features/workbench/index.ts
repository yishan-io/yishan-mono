/**
 * Workbench feature public API (Phase 12, desktop5.md).
 */
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
  setFileTabDirty,
  setSelectedTab,
  setTerminalTabAgentKind,
  splitWorkspacePane,
  unregisterTabFromPane,
} from "./commands/tabCommands";
export type { WorkbenchTab } from "./model/types";
export {
  workbenchNavigationStore,
  type OverlayPanel,
  type WorkbenchNavigationState,
} from "./state/workbenchNavigationStore";
export { splitPaneStore, type SplitPaneStoreState } from "./state/splitPaneStore";
export { tabStore, type TabStoreState } from "./state/tabStore";
export {
  layoutStore,
  type WorkspaceRightPaneTab,
  DEFAULT_RIGHT_PANE_TAB,
  type LayoutStoreState,
} from "./state/layoutStore";

// Stable UI entry points for cross-feature composition (Phase 18).
export { BrowserView } from "./ui/browser/BrowserView";
export { reloadWebview, removeWebviewsForClosedTabs } from "./ui/browser/webviewRegistry";
export { WorkspaceSplitPane } from "./ui/WorkspaceSplitPaneView";
export { WorkspaceTabSurfaceLayer } from "./ui/WorkspaceTabSurfaceLayer";
export { RightPaneTabBar, type RightPaneTabDef } from "./ui/RightPaneTabBar";
export {
  WorkspacePaneVisibilityProvider,
  type WorkspacePaneVisibilityValue,
  useWorkspacePaneVisibility,
  useWorkspacePaneVisibilityContext,
} from "./ui/hooks/useWorkspacePaneVisibility";
export { type WorkspaceTabPlacement, useWorkspaceTabPlacements } from "./ui/useWorkspaceTabPlacements";
