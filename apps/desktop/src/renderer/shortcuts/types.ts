import type { Commands } from "../app/commands/useCommands";
import type { SplitPaneStoreState } from "../domains/workbench/state/splitPaneStore";
import type { TabStoreState } from "../domains/workbench/state/tabStore";
import type { WorkspaceStoreState } from "../domains/workspace/state/workspaceStore";

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
