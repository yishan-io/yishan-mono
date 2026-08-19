/**
 * Workbench feature public API (Phase 12, desktop5.md).
 */
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
  reorderTab,
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
  setBrowserTabUrl,
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
export type {
  AgentChatSessionView,
  DiffFileChangeKind,
  FileDiffEntry,
  OpenTabInput,
  WorkbenchTab,
} from "./tabs";
export {
  workbenchNavigationStore,
  type OverlayPanel,
  type WorkbenchNavigationState,
} from "./state/workbenchNavigationStore";
export {
  TAB_FOCUS_REQUEST_EVENT,
  __resetTabFocusIntentForTests,
  clearTabFocus,
  consumeTabFocus,
  getTabFocusRequest,
  requestTabFocus,
  retainOpenTabFocus,
  type TabFocusKind,
  type TabFocusRequest,
  type TabFocusTarget,
} from "./runtime/tabFocusIntent";
export { splitPaneStore, type SplitPaneStoreState } from "./state/splitPaneStore";
export { findOppositePaneId } from "./split-pane";
export type { ExternalAppId } from "@shared/contracts/externalApps";

export { tabStore, type CloseTabOptions, type TabStoreState } from "./state/tabStore";
export {
  layoutStore,
  type WorkspaceRightPaneTab,
  DEFAULT_RIGHT_PANE_TAB,
  type LayoutStoreState,
} from "./state/layoutStore";

// Stable UI entry points for cross-feature composition (Phase 18).
export { WorkspaceSplitPane } from "./features/workspace-tabs/WorkspaceSplitPaneView";
export { WorkspaceTabSurfaceLayer } from "./features/workspace-tabs/WorkspaceTabSurfaceLayer";
export { RightPaneTabBar, type RightPaneTabDef } from "./features/workspace-tabs/RightPaneTabBar";
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
} from "./features/workspace-tabs/pane";
export {
  TabBar,
  type AgentCreateOptionDef,
  type TabBarCreateOption,
} from "./features/workspace-tabs/pane/TabBar";
export { TabBarItem } from "./features/workspace-tabs/pane/TabBarItem";
export { CreateTabMenu, SplitPaneMenu, TabContextMenu } from "./features/workspace-tabs/pane/TabBarMenus";
export { TabRenameDialog } from "./features/workspace-tabs/pane/TabRenameDialog";
export {
  WorkspacePaneVisibilityProvider,
  type WorkspacePaneVisibilityValue,
  useWorkspacePaneVisibility,
  useWorkspacePaneVisibilityContext,
} from "./hooks/useWorkspacePaneVisibility";
export {
  type WorkspaceTabPlacement,
  useWorkspaceTabPlacements,
} from "./features/workspace-tabs/useWorkspaceTabPlacements";

export { useDialogRegistration } from "./hooks/useDialogRegistration";
export { popupStore, type PopupStoreState } from "./state/popupStore";

export { ConfirmationDialog } from "./ui/ConfirmationDialog";
export { createWorkbenchEventHandlers } from "./subscriptions/workbenchEventHandlers";
export { isTerminalTabWithSessionId } from "./tabs";
