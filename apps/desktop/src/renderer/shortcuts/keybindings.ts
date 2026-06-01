import { ACTIONS } from "../../shared/contracts/actions";
import { SYSTEM_FILE_MANAGER_APP_ID } from "../../shared/contracts/externalApps";
import { setSelectedWorkspace } from "../commands/selectionCommands";
import { reloadWebview } from "../views/workspace/browser/webviewRegistry";
import { normalizeKeysString } from "./customKeybindings";
import { isEditableTarget, isWithinRepoFileTree, isWithinRepoWorkspaceList } from "./editableTarget";
import { toSupportedKeyBinding } from "./shortcutMetadata";
import type { KeyBindingScope, ShortContext, ShortcutDefinition, SupportedKeyBinding } from "./types";

export type { KeyBindingScope, ShortContext, ShortcutDefinition, SupportedKeyBinding } from "./types";

const WORKSPACE_ROUTE = "/";
const SETTINGS_ROUTE = "/settings";
const SETTINGS_KEYBINDINGS_ROUTE = "/settings?tab=keybindings";

const TAB_INDEX_HOTKEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  .flatMap((index) => [`ctrl+${index}`, `command+${index}`])
  .join(",");

type ShortcutTarget =
  | { command: typeof ACTIONS.NAVIGATE; payload: { path: string } }
  | { command: typeof ACTIONS.FILE_DELETE | typeof ACTIONS.FILE_UNDO }
  | { command: "tabs.create" }
  | { command: "tabs.closeSelected" }
  | { command: "tabs.openTerminal" }
  | { command: "tabs.openBrowser" }
  | { command: "tabs.selectByIndex" }
  | { command: "workspace.activatePane"; payload: { pane: "repo" | "files" | "changes" } }
  | { command: "workspace.openCreateWorkspaceDialog" }
  | { command: "workspace.focusFileTree" }
  | { command: "workspace.closeSelected" }
  | { command: "workspace.toggleLeftPane" }
  | { command: "workspace.toggleRightPane" }
  | { command: "workspace.openSelectedWorkspaceInExternalApp" }
  | { command: "workspace.openFileSearch" }
  | { command: "workspace.selectPreviousWorkspace" }
  | { command: "workspace.selectNextWorkspace" }
  | { command: "browser.reload" };

type ShortcutRegistryItem = {
  id: string;
  descriptionKey: string;
  scope: KeyBindingScope;
  keys: string;
  target?: ShortcutTarget;
  shouldRun?: (context: ShortContext, event: KeyboardEvent) => boolean;
  run?: (context: ShortContext, event: KeyboardEvent) => void;
};

export type ShortcutOverrideMap = Record<string, string>;

/** Returns true when one file-tree shortcut can run for the current event target. */
function shouldRunFileTreeShortcut(event: KeyboardEvent): boolean {
  if (isWithinRepoFileTree(event.target)) {
    return false;
  }

  return !isEditableTarget(event.target);
}

/** Returns true when one keyboard event key is a tab-index shortcut digit. */
function isTabIndexKey(key: string): boolean {
  return /^[1-9]$/.test(key);
}

/** Returns true when the current event target is inside one rendered xterm surface. */
function isWithinTerminalSurface(target: EventTarget | null): boolean {
  const targetElement = target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  if (!targetElement) {
    return false;
  }

  return Boolean(targetElement.closest(".xterm"));
}

/** Returns true when close-tab should run for one terminal-originated key event. */
function shouldRunTerminalCloseTabShortcut(event: KeyboardEvent): boolean {
  return event.metaKey && !event.ctrlKey;
}

/** Executes one shortcut target and returns true when one action was handled. */
function executeShortcutTarget(context: ShortContext, event: KeyboardEvent, target: ShortcutTarget): boolean {
  if (target.command === ACTIONS.NAVIGATE) {
    context.navigate(target.payload.path);
    event.preventDefault();
    return true;
  }

  if (target.command === ACTIONS.FILE_DELETE || target.command === ACTIONS.FILE_UNDO) {
    if (target.command === ACTIONS.FILE_DELETE) {
      context.commands.deleteSelectedFileTreeEntry();
    } else {
      context.commands.undoFileTreeOperation();
    }

    event.preventDefault();
    return true;
  }

  if (target.command === "tabs.create") {
    const workspaceId = context.workspaceStoreState.selectedWorkspaceId;
    if (!workspaceId) {
      return false;
    }

    context.commands.openTab({
      workspaceId,
      kind: "terminal",
      title: context.terminalTabTitle,
      reuseExisting: false,
    });
    event.preventDefault();
    return true;
  }

  if (target.command === "tabs.closeSelected") {
    const selectedTabId = context.tabStoreState.selectedTabId;
    if (!selectedTabId) {
      return false;
    }

    context.commands.closeTab(selectedTabId);
    event.preventDefault();
    return true;
  }

  if (target.command === "tabs.openTerminal") {
    const workspaceId = context.workspaceStoreState.selectedWorkspaceId;
    if (!workspaceId) {
      return false;
    }

    context.commands.openTab({
      workspaceId,
      kind: "terminal",
      title: context.terminalTabTitle,
      reuseExisting: false,
    });
    event.preventDefault();
    return true;
  }

  if (target.command === "tabs.openBrowser") {
    const workspaceId = context.workspaceStoreState.selectedWorkspaceId;
    if (!workspaceId) {
      return false;
    }

    context.commands.openTab({
      workspaceId,
      kind: "browser",
      url: "",
      reuseExisting: false,
    });
    event.preventDefault();
    return true;
  }

  if (target.command === "workspace.activatePane") {
    context.commands.activateWorkspacePane(target.payload.pane);
    event.preventDefault();
    return true;
  }

  if (target.command === "workspace.openCreateWorkspaceDialog") {
    context.commands.openCreateWorkspaceDialog();
    event.preventDefault();
    return true;
  }

  if (target.command === "workspace.focusFileTree") {
    context.commands.focusWorkspaceFileTree();
    event.preventDefault();
    return true;
  }

  if (target.command === "workspace.closeSelected") {
    const workspaceId = context.workspaceStoreState.selectedWorkspaceId;
    if (!workspaceId) {
      return false;
    }

    void context.commands.closeWorkspace(workspaceId);
    event.preventDefault();
    return true;
  }

  if (target.command === "workspace.toggleLeftPane") {
    context.commands.toggleLeftPaneVisibility();
    event.preventDefault();
    return true;
  }

  if (target.command === "workspace.toggleRightPane") {
    context.commands.toggleRightPaneVisibility();
    event.preventDefault();
    return true;
  }

  if (target.command === "workspace.openFileSearch") {
    context.commands.openWorkspaceFileSearch();
    event.preventDefault();
    return true;
  }

  if (target.command === "workspace.selectPreviousWorkspace" || target.command === "workspace.selectNextWorkspace") {
    const direction = target.command === "workspace.selectNextWorkspace" ? 1 : -1;
    const displayProjectIds = new Set(context.workspaceStoreState.displayProjectIds ?? []);
    const visibleWorkspaces = context.workspaceStoreState.workspaces.filter((workspace) => {
      const projectId = workspace.projectId ?? workspace.repoId;
      return displayProjectIds.has(projectId);
    });
    if (visibleWorkspaces.length === 0) {
      return false;
    }

    const currentId = context.tabStoreState.selectedWorkspaceId;
    const currentIndex = visibleWorkspaces.findIndex((workspace) => workspace.id === currentId);
    const nextIndex = (currentIndex + direction + visibleWorkspaces.length) % visibleWorkspaces.length;
    const nextWorkspace = visibleWorkspaces[nextIndex];
    if (!nextWorkspace || nextWorkspace.id === currentId) {
      return false;
    }

    setSelectedWorkspace(nextWorkspace.id);
    event.preventDefault();
    return true;
  }

  if (target.command === "browser.reload") {
    const tabId = context.tabStoreState.selectedTabId;
    if (!tabId) {
      return false;
    }
    reloadWebview(tabId);
    event.preventDefault();
    return true;
  }

  if (target.command === "workspace.openSelectedWorkspaceInExternalApp") {
    const workspaceId = context.workspaceStoreState.selectedWorkspaceId || context.tabStoreState.selectedWorkspaceId;
    if (!workspaceId) {
      return false;
    }

    const selectedWorkspace = context.workspaceStoreState.workspaces.find((workspace) => workspace.id === workspaceId);
    const workspaceWorktreePath = selectedWorkspace?.worktreePath?.trim();
    if (!workspaceWorktreePath) {
      return false;
    }

    void context.commands.openEntryInExternalApp({
      workspaceWorktreePath,
      appId: context.workspaceStoreState.lastUsedExternalAppId ?? SYSTEM_FILE_MANAGER_APP_ID,
    });
    event.preventDefault();
    return true;
  }

  const parsedIndex = Number.parseInt(event.key, 10) - 1;
  if (Number.isNaN(parsedIndex) || parsedIndex < 0) {
    return false;
  }

  const workspaceId = context.workspaceStoreState.selectedWorkspaceId || context.tabStoreState.selectedWorkspaceId;
  if (!workspaceId) {
    return false;
  }

  const activePane = context.splitPaneStoreState.getActivePane(workspaceId);
  if (!activePane) {
    return false;
  }

  const tabs = context.tabStoreState.getWorkspaceTabs(workspaceId);
  const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
  const orderedPaneTabs = activePane.tabIds
    .map((tabId) => tabsById.get(tabId))
    .filter((tab): tab is (typeof tabs)[number] => tab != null)
    .sort((a, b) => {
      if (a.pinned === b.pinned) {
        return 0;
      }

      return a.pinned ? -1 : 1;
    });
  const nextTab = orderedPaneTabs[parsedIndex];
  if (!nextTab) {
    return false;
  }

  context.splitPaneStoreState.selectTab(workspaceId, activePane.id, nextTab.id);
  context.commands.selectTab(nextTab.id);
  event.preventDefault();
  return true;
}

const SHORTCUT_REGISTRY: readonly ShortcutRegistryItem[] = [
  {
    id: "open-keybindings",
    descriptionKey: "keybindings.actions.openKeybindings",
    scope: "global",
    keys: "ctrl+/,command+/",
    target: { command: ACTIONS.NAVIGATE, payload: { path: SETTINGS_KEYBINDINGS_ROUTE } },
    shouldRun: (context) => context.pathname !== SETTINGS_ROUTE,
  },
  {
    id: "close-keybindings",
    descriptionKey: "keybindings.actions.backToWorkspace",
    scope: "global",
    keys: "esc",
    target: { command: ACTIONS.NAVIGATE, payload: { path: WORKSPACE_ROUTE } },
    shouldRun: (context) => context.pathname === SETTINGS_ROUTE,
  },
  {
    id: "new-tab",
    descriptionKey: "keybindings.actions.newTab",
    scope: "workspace",
    keys: "ctrl+y,command+y",
    target: { command: "tabs.create" },
    shouldRun: (context) => Boolean(context.workspaceStoreState.selectedWorkspaceId),
  },
  {
    id: "close-tab",
    descriptionKey: "keybindings.actions.closeTab",
    scope: "workspace",
    keys: "ctrl+w,command+w",
    target: { command: "tabs.closeSelected" },
    shouldRun: (context, event) => {
      if (!context.tabStoreState.selectedTabId) {
        return false;
      }

      if (!isWithinTerminalSurface(event.target)) {
        return true;
      }

      return shouldRunTerminalCloseTabShortcut(event);
    },
  },
  {
    id: "close-selected-workspace",
    descriptionKey: "keybindings.actions.closeWorkspace",
    scope: "workspace",
    keys: "ctrl+shift+w,command+shift+w",
    target: { command: "workspace.closeSelected" },
    shouldRun: (context, event) =>
      Boolean(context.workspaceStoreState.selectedWorkspaceId) &&
      !isEditableTarget(event.target) &&
      isWithinRepoWorkspaceList(event.target),
  },
  {
    id: "create-workspace",
    descriptionKey: "keybindings.actions.createWorkspace",
    scope: "workspace",
    keys: "ctrl+n,command+n",
    target: { command: "workspace.openCreateWorkspaceDialog" },
  },
  {
    id: "open-terminal",
    descriptionKey: "keybindings.actions.openTerminal",
    scope: "workspace",
    keys: "ctrl+t,command+t",
    target: { command: "tabs.openTerminal" },
    shouldRun: (context) => Boolean(context.workspaceStoreState.selectedWorkspaceId),
  },
  {
    id: "open-browser",
    descriptionKey: "keybindings.actions.openBrowser",
    scope: "workspace",
    keys: "ctrl+shift+b,command+shift+b",
    target: { command: "tabs.openBrowser" },
    shouldRun: (context) => Boolean(context.workspaceStoreState.selectedWorkspaceId),
  },
  {
    id: "reload-browser-tab",
    descriptionKey: "keybindings.actions.reloadBrowserTab",
    scope: "workspace",
    keys: "ctrl+r,command+r",
    target: { command: "browser.reload" },
    shouldRun: (context) => {
      const selectedTabId = context.tabStoreState.selectedTabId;
      return context.tabStoreState.tabs.some((tab) => tab.id === selectedTabId && tab.kind === "browser");
    },
  },
  {
    id: "activate-repo-pane",
    descriptionKey: "keybindings.actions.activateRepoPane",
    scope: "workspace",
    keys: "ctrl+shift+r,command+shift+r",
    target: { command: "workspace.activatePane", payload: { pane: "repo" } },
  },
  {
    id: "activate-files-pane",
    descriptionKey: "keybindings.actions.activateFilesPane",
    scope: "workspace",
    keys: "ctrl+shift+f,command+shift+f",
    target: { command: "workspace.focusFileTree" },
  },
  {
    id: "activate-changes-pane",
    descriptionKey: "keybindings.actions.activateChangesPane",
    scope: "workspace",
    keys: "ctrl+shift+g,command+shift+g",
    target: { command: "workspace.activatePane", payload: { pane: "changes" } },
  },
  {
    id: "toggle-left-pane",
    descriptionKey: "keybindings.actions.toggleLeftPane",
    scope: "workspace",
    keys: "ctrl+b,command+b",
    target: { command: "workspace.toggleLeftPane" },
  },
  {
    id: "toggle-right-pane",
    descriptionKey: "keybindings.actions.toggleRightPane",
    scope: "workspace",
    keys: "ctrl+l,command+l",
    target: { command: "workspace.toggleRightPane" },
  },
  {
    id: "select-previous-workspace",
    descriptionKey: "keybindings.actions.selectPreviousWorkspace",
    scope: "workspace",
    keys: "ctrl+command+k",
    target: { command: "workspace.selectPreviousWorkspace" },
  },
  {
    id: "select-next-workspace",
    descriptionKey: "keybindings.actions.selectNextWorkspace",
    scope: "workspace",
    keys: "ctrl+command+j",
    target: { command: "workspace.selectNextWorkspace" },
  },
  {
    id: "open-file-search",
    descriptionKey: "keybindings.actions.openFileSearch",
    scope: "workspace",
    keys: "ctrl+p,command+p",
    target: { command: "workspace.openFileSearch" },
    shouldRun: (context) => Boolean(context.workspaceStoreState.selectedWorkspaceId),
  },
  {
    id: ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP,
    descriptionKey: "keybindings.actions.openSelectedFileInExternalApp",
    scope: "workspace",
    keys: "ctrl+o,command+o",
    target: { command: "workspace.openSelectedWorkspaceInExternalApp" },
    shouldRun: (context) => Boolean(context.workspaceStoreState.selectedWorkspaceId),
  },
  {
    id: ACTIONS.FILE_DELETE,
    descriptionKey: "keybindings.actions.deleteSelectedFileTreeEntry",
    scope: "workspace",
    keys: "ctrl+backspace,ctrl+delete,command+backspace,command+delete",
    target: { command: ACTIONS.FILE_DELETE },
    shouldRun: (context, event) =>
      Boolean(context.workspaceStoreState.selectedWorkspaceId) &&
      shouldRunFileTreeShortcut(event),
  },
  {
    id: ACTIONS.FILE_UNDO,
    descriptionKey: "keybindings.actions.undoFileTreeOperation",
    scope: "workspace",
    keys: "ctrl+z,command+z",
    target: { command: ACTIONS.FILE_UNDO },
    shouldRun: (context, event) =>
      Boolean(context.workspaceStoreState.selectedWorkspaceId) &&
      !event.shiftKey &&
      shouldRunFileTreeShortcut(event),
  },
  {
    id: "select-tab-by-index",
    descriptionKey: "keybindings.actions.selectTabByIndex",
    scope: "workspace",
    keys: TAB_INDEX_HOTKEYS,
    target: { command: "tabs.selectByIndex" },
    shouldRun: (_context, event) => isTabIndexKey(event.key),
  },
  {
    id: "toggle-voice-input",
    descriptionKey: "keybindings.actions.toggleVoiceInput",
    scope: "workspace",
    keys: "ctrl+shift+v,command+shift+v",
    run: (_context, event) => {
      event.preventDefault();
    },
  },
] as const;

function resolveShortcutKeys(shortcutId: string, defaultKeys: string, overrides: ShortcutOverrideMap = {}): string {
  const override = overrides[shortcutId];
  if (!override) {
    return defaultKeys;
  }

  return normalizeKeysString(override) ?? defaultKeys;
}

/**
 * Returns all runtime shortcut definitions with metadata and callback handlers.
 */
export function getShortcutDefinitions(overrides: ShortcutOverrideMap = {}): readonly ShortcutDefinition[] {
  return SHORTCUT_REGISTRY.map((shortcutItem) => {
    if (!shortcutItem.target && !shortcutItem.run) {
      throw new Error(`Missing shortcut target or run callback for id: ${shortcutItem.id}`);
    }

    return {
      id: shortcutItem.id,
      descriptionKey: shortcutItem.descriptionKey,
      scope: shortcutItem.scope,
      keys: resolveShortcutKeys(shortcutItem.id, shortcutItem.keys, overrides),
      run: (context: ShortContext, event: KeyboardEvent) => {
        if (shortcutItem.shouldRun && !shortcutItem.shouldRun(context, event)) {
          return;
        }

        if (shortcutItem.run) {
          shortcutItem.run(context, event);
          return;
        }

        if (!shortcutItem.target) {
          return;
        }

        executeShortcutTarget(context, event, shortcutItem.target);
      },
    };
  });
}

/** Returns one key string for one shortcut id when the id exists in the shortcut registry. */
export function getShortcutKeysById(id: string, overrides: ShortcutOverrideMap = {}): string | undefined {
  const shortcut = SHORTCUT_REGISTRY.find((binding) => binding.id === id);
  if (!shortcut) {
    return undefined;
  }

  return resolveShortcutKeys(shortcut.id, shortcut.keys, overrides);
}

/** Returns one supported keybinding metadata entry for one shortcut id when present. */
export function getSupportedKeyBindingById(id: string): SupportedKeyBinding | undefined {
  return SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === id);
}

/** Returns supported keybindings with optional user overrides applied. */
export function getSupportedKeyBindings(overrides: ShortcutOverrideMap = {}): readonly SupportedKeyBinding[] {
  return getShortcutDefinitions(overrides).map(toSupportedKeyBinding);
}

/** Keyboard shortcut metadata used for shortcut map rendering. */
export const SUPPORTED_KEY_BINDINGS: readonly SupportedKeyBinding[] =
  getShortcutDefinitions().map(toSupportedKeyBinding);
