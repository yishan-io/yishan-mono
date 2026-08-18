/**
 * Workbench feature public API (Phase 12, desktop5.md).
 */
export {
  appendBrowserHistory,
  loadBrowserHistory,
  openExternalUrl,
} from "./infrastructure/browserHostCommands";
export type { AppendBrowserHistoryInput, BrowserHistoryGroup } from "./infrastructure/browserHostCommands";
export { createFixedRuntimeLayer } from "./runtime/runtimeSurfaceLayer";
export { getOrCreateRuntimeRoot } from "./runtime/runtimeRoot";
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
  promoteTemporaryTab,
  registerTabInPane,
  removeRightPaneStateForWorkspace,
  renameTab,
  renameTabsForEntryRename,
  reorderPaneTab,
  resizeLeftPane,
  resizeRightPane,
  resolveTabForWorkspace,
  retainWorkspaceTabs,
  setActivePane,
  setAgentChatTabSubagentControl,
  setBrowserTabFaviconUrl,
  setLeftPaneHidden,
  setIsRightPaneHidden,
  setRightPaneTab,
  setFileTabDirty,
  setSelectedTab,
  setTerminalTabAgentKind,
  splitWorkspacePane,
  toggleTabPinned,
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
  ColumnSeparator,
  PaneHeader,
  PaneLoadingBar,
  PaneToggleButton,
  SplitDropZone,
  SplitPaneContainer,
  SplitPaneGroup,
  SplitPaneLayout,
  TabPanel,
} from "./ui/pane";
export {
  TabBar,
  type AgentCreateOptionDef,
  type TabBarCreateOption,
} from "./ui/pane/TabBar";
export { TabBarItem } from "./ui/pane/TabBarItem";
export { CreateTabMenu, SplitPaneMenu, TabContextMenu } from "./ui/pane/TabBarMenus";
export { TabRenameDialog } from "./ui/pane/TabRenameDialog";
export {
  WorkspacePaneVisibilityProvider,
  type WorkspacePaneVisibilityValue,
  useWorkspacePaneVisibility,
  useWorkspacePaneVisibilityContext,
} from "./ui/hooks/useWorkspacePaneVisibility";
export { type WorkspaceTabPlacement, useWorkspaceTabPlacements } from "./ui/useWorkspaceTabPlacements";
