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
export type { WorkspaceTab } from "./model/types";
export type { TabStoreState } from "./state/tabStore";
export {
  workbenchNavigationStore,
  type OverlayPanel,
  type WorkbenchNavigationState,
} from "./state/workbenchNavigationStore";
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
export { WorkspaceTabSurfaceLayer } from "./ui/WorkspaceTabSurfaceLayer";
export { type WorkspaceTabPlacement, useWorkspaceTabPlacements } from "./ui/useWorkspaceTabPlacements";
