import type { Commands } from "../hooks/useCommands";
import type { SplitPaneStoreState } from "../store/splitPaneStore";
import type { TabStoreState } from "../store/tabStore";
import type { WorkspaceStoreState } from "../store/workspaceStore";

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
  splitPaneStoreState: SplitPaneStoreState;
  terminalTabTitle: string;
  commands: Commands;
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
