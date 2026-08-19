import { SHORTCUT_KEYS } from "@shared/shortcuts/shortcutKeyCatalog";
import { ACTIONS } from "../../shared/contracts/actions";
import { normalizeKeysString } from "./customKeybindings";
import { isEditableTarget, isWithinRepoWorkspaceList } from "./editableTarget";
import {
  type ShortcutRegistryItem,
  type ShortcutTarget,
  TAB_INDEX_HOTKEYS,
  executeShortcutTarget,
  isTabIndexKey,
  isWithinTerminalSurface,
  shouldRunFileTreeShortcut,
  shouldRunTerminalCloseTabShortcut,
} from "./shortcutActions";
import { toSupportedKeyBinding } from "./shortcutMetadata";
import type { KeyBindingScope, ShortContext, ShortcutDefinition, SupportedKeyBinding } from "./types";

export type { KeyBindingScope, ShortContext, ShortcutDefinition, SupportedKeyBinding } from "./types";

export type ShortcutOverrideMap = Record<string, string>;

const WORKSPACE_ROUTE = "/";
const SETTINGS_ROUTE = "/settings";
const SETTINGS_KEYBINDINGS_ROUTE = "/settings?tab=keybindings";

const SHORTCUT_REGISTRY: readonly ShortcutRegistryItem[] = [
  {
    id: "open-keybindings",
    descriptionKey: "keybindings.actions.openKeybindings",
    scope: "global",
    keys: SHORTCUT_KEYS["open-keybindings"],
    target: { command: ACTIONS.NAVIGATE, payload: { path: SETTINGS_KEYBINDINGS_ROUTE } },
    shouldRun: (context) => context.pathname !== SETTINGS_ROUTE,
  },
  {
    id: "close-keybindings",
    descriptionKey: "keybindings.actions.backToWorkspace",
    scope: "global",
    keys: SHORTCUT_KEYS["close-keybindings"],
    target: { command: ACTIONS.NAVIGATE, payload: { path: WORKSPACE_ROUTE } },
    shouldRun: (context) => context.pathname === SETTINGS_ROUTE && document.querySelector(".MuiDialog-root") === null,
  },
  {
    id: "new-tab",
    descriptionKey: "keybindings.actions.newTab",
    scope: "workspace",
    keys: SHORTCUT_KEYS["new-tab"],
    target: { command: "tabs.create" },
    shouldRun: (context) => Boolean(context.activeWorkspaceId),
  },
  {
    id: "close-tab",
    descriptionKey: "keybindings.actions.closeTab",
    scope: "workspace",
    keys: SHORTCUT_KEYS["close-tab"],
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
    keys: SHORTCUT_KEYS["close-selected-workspace"],
    target: { command: "workspace.closeSelected" },
    shouldRun: (context, event) =>
      Boolean(context.activeWorkspaceId) && !isEditableTarget(event.target) && isWithinRepoWorkspaceList(event.target),
  },
  {
    id: "create-workspace",
    descriptionKey: "keybindings.actions.createWorkspace",
    scope: "workspace",
    keys: SHORTCUT_KEYS["create-workspace"],
    target: { command: "workspace.openCreateWorkspaceDialog" },
  },
  {
    id: "open-terminal",
    descriptionKey: "keybindings.actions.openTerminal",
    scope: "workspace",
    keys: SHORTCUT_KEYS["open-terminal"],
    target: { command: "tabs.openTerminal" },
    shouldRun: (context) => Boolean(context.activeWorkspaceId),
  },
  {
    id: "open-agent-chat",
    descriptionKey: "keybindings.actions.openAgentChat",
    scope: "workspace",
    keys: SHORTCUT_KEYS["open-agent-chat"],
    target: { command: "tabs.openAgentChat" },
    shouldRun: (context) => Boolean(context.activeWorkspaceId),
  },
  {
    id: "open-browser",
    descriptionKey: "keybindings.actions.openBrowser",
    scope: "workspace",
    keys: SHORTCUT_KEYS["open-browser"],
    target: { command: "tabs.openBrowser" },
    shouldRun: (context) => Boolean(context.activeWorkspaceId),
  },
  {
    id: "open-whiteboard",
    descriptionKey: "keybindings.actions.openWhiteboard",
    scope: "workspace",
    keys: SHORTCUT_KEYS["open-whiteboard"],
    target: { command: "tabs.openWhiteboard" },
    shouldRun: (context) => Boolean(context.activeWorkspaceId),
  },
  {
    id: "focus-agent-chat-composer",
    descriptionKey: "keybindings.actions.focusAgentChatComposer",
    scope: "workspace",
    keys: SHORTCUT_KEYS["focus-agent-chat-composer"],
    target: { command: "agentChat.focusComposer" },
  },
  {
    id: "reload-browser-tab",
    descriptionKey: "keybindings.actions.reloadBrowserTab",
    scope: "workspace",
    keys: SHORTCUT_KEYS["reload-browser-tab"],
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
    keys: SHORTCUT_KEYS["activate-repo-pane"],
    target: { command: "workspace.activatePane", payload: { pane: "repo" } },
  },
  {
    id: "activate-files-pane",
    descriptionKey: "keybindings.actions.activateFilesPane",
    scope: "workspace",
    keys: SHORTCUT_KEYS["activate-files-pane"],
    target: { command: "workspace.focusFileTree" },
  },
  {
    id: "activate-changes-pane",
    descriptionKey: "keybindings.actions.activateChangesPane",
    scope: "workspace",
    keys: SHORTCUT_KEYS["activate-changes-pane"],
    target: { command: "workspace.activatePane", payload: { pane: "changes" } },
  },
  {
    id: "activate-pr-pane",
    descriptionKey: "keybindings.actions.activatePrPane",
    scope: "workspace",
    keys: SHORTCUT_KEYS["activate-pr-pane"],
    target: { command: "workspace.activatePane", payload: { pane: "pr" } },
  },
  {
    id: "toggle-left-pane",
    descriptionKey: "keybindings.actions.toggleLeftPane",
    scope: "workspace",
    keys: SHORTCUT_KEYS["toggle-left-pane"],
    target: { command: "workspace.toggleLeftPane" },
  },
  {
    id: "select-previous-workspace",
    descriptionKey: "keybindings.actions.selectPreviousWorkspace",
    scope: "workspace",
    keys: SHORTCUT_KEYS["select-previous-workspace"],
    target: { command: "workspace.selectPreviousWorkspace" },
  },
  {
    id: "select-next-workspace",
    descriptionKey: "keybindings.actions.selectNextWorkspace",
    scope: "workspace",
    keys: SHORTCUT_KEYS["select-next-workspace"],
    target: { command: "workspace.selectNextWorkspace" },
  },
  {
    id: "open-file-search",
    descriptionKey: "keybindings.actions.openFileSearch",
    scope: "workspace",
    keys: SHORTCUT_KEYS["open-file-search"],
    target: { command: "workspace.openFileSearch" },
    shouldRun: (context) => Boolean(context.activeWorkspaceId),
  },
  {
    id: ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP,
    descriptionKey: "keybindings.actions.openSelectedFileInExternalApp",
    scope: "workspace",
    keys: SHORTCUT_KEYS[ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP],
    target: { command: "workspace.openSelectedWorkspaceInExternalApp" },
    shouldRun: (context) => Boolean(context.activeWorkspaceId),
  },
  {
    id: ACTIONS.FILE_DELETE,
    descriptionKey: "keybindings.actions.deleteSelectedFileTreeEntry",
    scope: "workspace",
    keys: SHORTCUT_KEYS[ACTIONS.FILE_DELETE],
    target: { command: ACTIONS.FILE_DELETE },
    shouldRun: (context, event) => Boolean(context.activeWorkspaceId) && shouldRunFileTreeShortcut(event),
  },
  {
    id: ACTIONS.FILE_UNDO,
    descriptionKey: "keybindings.actions.undoFileTreeOperation",
    scope: "workspace",
    keys: SHORTCUT_KEYS[ACTIONS.FILE_UNDO],
    target: { command: ACTIONS.FILE_UNDO },
    shouldRun: (context, event) =>
      Boolean(context.activeWorkspaceId) && !event.shiftKey && shouldRunFileTreeShortcut(event),
  },
  {
    id: "select-tab-by-index",
    descriptionKey: "keybindings.actions.selectTabByIndex",
    scope: "workspace",
    keys: TAB_INDEX_HOTKEYS,
    target: { command: "tabs.selectByIndex" },
    shouldRun: (_context, event) => isTabIndexKey(event.key),
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
          return false;
        }

        if (shortcutItem.run) {
          shortcutItem.run(context, event);
          return true;
        }

        if (!shortcutItem.target) {
          return false;
        }

        return executeShortcutTarget(context, event, shortcutItem.target);
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
