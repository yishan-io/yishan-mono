/**
 * Workbench feature public API.
 *
 * Test-infra constraint: the eager cross-domain imports below (tabCommands →
 * files/git/agent) make the workbench↔files module cycle real. vite-node
 * deadlocks when an async `vi.mock` factory `await import()`s a module whose
 * graph reaches this index before the index itself is mocked (see
 * WorkspaceNavigatorView.test.tsx). New tests must stub the leaf view instead
 * of deep-importing through it inside a mock factory.
 */
export { createFixedRuntimeLayer } from "./runtime/runtimeSurfaceLayer";

export {
  activateProject,
  activateWorkspace,
  closeOverlayPanel,
  toggleTaskHubOverlay,
} from "./commands/navigationCommands";
export {
  bindAgentChatTabRuntime,
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
  openTabWithContentSeed,
  paneSelectTab,
  promoteTemporaryTab,
  registerTabInPane,
  reorderTab,
  removeRightPaneStateForWorkspace,
  renameTab,
  renameTabWithAgentSessionSync,
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

// Stable UI entry points for cross-feature composition.
export { WorkspaceSplitPane } from "./features/workspace-tabs/WorkspaceSplitPaneView";

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
export { TabBar, type AgentCreateOptionDef, type TabBarCreateOption } from "./features/workspace-tabs/pane/TabBar";

export {
  WorkspacePaneVisibilityProvider,
  type WorkspacePaneVisibilityValue,
  useWorkspacePaneVisibility,
  useWorkspacePaneVisibilityContext,
} from "./hooks/useWorkspacePaneVisibility";
export type { WorkspaceTabPlacement } from "./features/workspace-tabs/useWorkspaceTabPlacements";

export { useDialogRegistration } from "./hooks/useDialogRegistration";
export { popupStore, type PopupStoreState } from "./state/popupStore";

export { createWorkbenchEventHandlers } from "./subscriptions/workbenchEventHandlers";
export { isTerminalTabWithSessionId } from "./tabs";
