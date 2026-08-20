import type { openEntryInExternalApp } from "@renderer/domains/files";
import type { closeTab, openTab, setSelectedTab } from "@renderer/domains/workbench";
import type {
  activateWorkspacePane,
  closeWorkspace,
  deleteSelectedFileTreeEntry,
  focusWorkspaceFileTree,
  openCreateWorkspaceDialog,
  openWorkspaceFileSearch,
  toggleLeftPaneVisibility,
  toggleRightPaneVisibility,
  undoFileTreeOperation,
} from "@renderer/domains/workspace";
import type { SplitPaneStoreState } from "../domains/workbench/state/splitPaneStore";
import type { TabStoreState } from "../domains/workbench/state/tabStore";
import type { WorkspaceStoreState } from "../domains/workspace/state/workspaceStore";

/**
 * Narrow action registry for the shortcut runtime (Desktop 11 Phase 46).
 *
 * The runtime needs only these members; it no longer consumes the composed
 * App command surface.
 */
export type ShortcutActionRegistry = {
  activateWorkspacePane: typeof activateWorkspacePane;
  closeTab: typeof closeTab;
  closeWorkspace: typeof closeWorkspace;
  deleteSelectedFileTreeEntry: typeof deleteSelectedFileTreeEntry;
  focusWorkspaceFileTree: typeof focusWorkspaceFileTree;
  openCreateWorkspaceDialog: typeof openCreateWorkspaceDialog;
  openEntryInExternalApp: typeof openEntryInExternalApp;
  openTab: typeof openTab;
  openWorkspaceFileSearch: typeof openWorkspaceFileSearch;
  selectTab: typeof setSelectedTab;
  toggleLeftPaneVisibility: typeof toggleLeftPaneVisibility;
  toggleRightPaneVisibility: typeof toggleRightPaneVisibility;
  undoFileTreeOperation: typeof undoFileTreeOperation;
};

export type KeyBindingScope = "global" | "workspace";

export type SupportedKeyBinding = {
  id: string;
  descriptionKey: string;
  scope: KeyBindingScope;
  macKeys: readonly string[];
  windowsKeys: readonly string[];
};

export type ShortContext = {
  pathname: string;
  isWorkspaceRoute: boolean;
  isPopupOpen: boolean;
  tabStoreState: TabStoreState;
  workspaceStoreState: WorkspaceStoreState;
  activeWorkspaceId: string;
  splitPaneStoreState: SplitPaneStoreState;
  terminalTabTitle: string;
  commands: ShortcutActionRegistry;
  navigate: (path: string) => void;
};

export type ShortcutDefinition = {
  id: string;
  descriptionKey: string;
  scope: KeyBindingScope;
  keys: string;
  run: (context: ShortContext, event: KeyboardEvent) => boolean;
};

export type ShortcutCatalogItem = {
  id: string;
  descriptionKey: string;
  scope: KeyBindingScope;
  keys: string;
};
