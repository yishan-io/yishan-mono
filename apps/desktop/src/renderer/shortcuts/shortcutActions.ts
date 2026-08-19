import { reloadWebview } from "@renderer/domains/browser";
import { getLastUsedExternalAppId } from "@renderer/domains/project";
import { activateWorkspace } from "@renderer/domains/workbench";
import { requestTabFocus } from "@renderer/domains/workbench";
import { ACTIONS } from "../../shared/contracts/actions";
import { SYSTEM_FILE_MANAGER_APP_ID } from "../../shared/contracts/externalApps";
import { createNewWhiteboard } from "../domains/files/commands/whiteboardCommands";
import { normalizeKeysString } from "./customKeybindings";
import { isEditableTarget, isWithinRepoFileTree, isWithinRepoWorkspaceList } from "./editableTarget";
import type { KeyBindingScope, ShortContext, ShortcutDefinition, SupportedKeyBinding } from "./types";

/**
 * Shortcut execution layer (desktop8 Phase 33: split from keybindings.ts).
 * Key definitions live in keybindings.ts; key matching lives in shortcutRunner.
 */

export const TAB_INDEX_HOTKEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  .flatMap((index) => [`ctrl+${index}`, `command+${index}`])
  .join(",");
export type ShortcutTarget =
  | { command: typeof ACTIONS.NAVIGATE; payload: { path: string } }
  | { command: typeof ACTIONS.FILE_DELETE | typeof ACTIONS.FILE_UNDO }
  | { command: "tabs.create" }
  | { command: "tabs.closeSelected" }
  | { command: "tabs.openTerminal" }
  | { command: "tabs.openAgentChat" }
  | { command: "tabs.openBrowser" }
  | { command: "tabs.openWhiteboard" }
  | { command: "agentChat.focusComposer" }
  | { command: "tabs.selectByIndex" }
  | { command: "workspace.activatePane"; payload: { pane: "repo" | "files" | "changes" | "pr" } }
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

export type ShortcutRegistryItem = {
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
export function shouldRunFileTreeShortcut(event: KeyboardEvent): boolean {
  if (isWithinRepoFileTree(event.target)) {
    return false;
  }

  return !isEditableTarget(event.target);
}

/** Returns true when one keyboard event key is a tab-index shortcut digit. */
export function isTabIndexKey(key: string): boolean {
  return /^[1-9]$/.test(key);
}

/** Returns true when the current event target is inside one rendered xterm surface. */
export function isWithinTerminalSurface(target: EventTarget | null): boolean {
  const targetElement = target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  if (!targetElement) {
    return false;
  }

  return Boolean(targetElement.closest(".xterm"));
}

/** Returns true when close-tab should run for one terminal-originated key event. */
export function shouldRunTerminalCloseTabShortcut(event: KeyboardEvent): boolean {
  return event.metaKey && !event.ctrlKey;
}

/** Executes one shortcut target and returns true when one action was handled. */
export function executeShortcutTarget(context: ShortContext, event: KeyboardEvent, target: ShortcutTarget): boolean {
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
    const workspaceId = context.activeWorkspaceId;
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
    const workspaceId = context.activeWorkspaceId;
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

  if (target.command === "tabs.openAgentChat") {
    const workspaceId = context.activeWorkspaceId;
    const workspace = context.workspaceStoreState.workspaces.find((item) => item.id === workspaceId);
    if (!workspaceId || !workspace?.worktreePath) {
      return false;
    }

    context.commands.openTab({ workspaceId, kind: "agent-chat", cwd: workspace.worktreePath });
    event.preventDefault();
    return true;
  }

  if (target.command === "agentChat.focusComposer") {
    const selectedTab = context.tabStoreState.tabs.find((tab) => tab.id === context.tabStoreState.selectedTabId);
    if (selectedTab?.kind !== "agent-chat" || selectedTab.data.sessionView === "subagent-detail") {
      return false;
    }

    requestTabFocus(selectedTab.id, "agent-composer", "manual");
    event.preventDefault();
    return true;
  }

  if (target.command === "tabs.openBrowser") {
    const workspaceId = context.activeWorkspaceId;
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

  if (target.command === "tabs.openWhiteboard") {
    const workspaceId = context.activeWorkspaceId;
    if (!workspaceId) {
      return false;
    }

    void createNewWhiteboard(workspaceId);
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
    const workspaceId = context.activeWorkspaceId;
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
    const orderedIds = context.workspaceStoreState.orderedWorkspaceIds;
    if (orderedIds.length === 0) {
      return false;
    }

    const currentId = context.activeWorkspaceId;
    const currentIndex = orderedIds.findIndex((id) => id === currentId);
    const nextIndex = (currentIndex + direction + orderedIds.length) % orderedIds.length;
    const nextId = orderedIds[nextIndex];
    if (!nextId || nextId === currentId) {
      return false;
    }

    activateWorkspace({ workspaceId: nextId });
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
    const workspaceId = context.activeWorkspaceId;
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
      appId: getLastUsedExternalAppId() ?? SYSTEM_FILE_MANAGER_APP_ID,
    });
    event.preventDefault();
    return true;
  }

  const parsedIndex = Number.parseInt(event.key, 10) - 1;
  if (Number.isNaN(parsedIndex) || parsedIndex < 0) {
    return false;
  }

  const workspaceId = context.activeWorkspaceId;
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
