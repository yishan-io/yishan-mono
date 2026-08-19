import type { KeyboardEvent } from "react";

export type FileTreeContextActionId = string;

export type FileTreeShortcutActionId = string;

export type FileTreeActionGroup = "create" | "edit" | "clipboard" | "path";

export type FileTreeContextActionDefinition = {
  id: FileTreeContextActionId;
  group: FileTreeActionGroup;
  isVisible: (context: FileTreeContextMenuBuildContext) => boolean;
  isDisabled: (context: FileTreeContextMenuBuildContext) => boolean;
  getLabel: (context: FileTreeContextMenuBuildContext) => string;
  run: (context: FileTreeContextMenuBuildContext) => void | Promise<void>;
};

export type FileTreeShortcutDefinition = {
  id: FileTreeShortcutActionId;
  matches: (key: string) => boolean;
  run: (context: FileTreeShortcutContext) => void | Promise<void>;
};

export type FileTreeContextMenuItem =
  | {
      kind: "action";
      id: FileTreeContextActionId;
      label: string;
      disabled: boolean;
      onSelect: () => void | Promise<void>;
    }
  | {
      kind: "divider";
      id: string;
    };

export type FileTreeActionLabels = {
  createFile: string;
  createFolder: string;
  rename: string;
  delete: string;
  copy: string;
  cut: string;
  paste: string;
  copyPath: string;
  copyRelativePath: string;
  openInFileManager: string;
};

export type FileTreeContextMenuBuildContext = {
  labels: FileTreeActionLabels;
  canCreateAtContext: boolean;
  canCreateFile: boolean;
  canCreateFolder: boolean;
  canRenameEntry: boolean;
  canDeleteEntry: boolean;
  canCopyEntry: boolean;
  canCutEntry: boolean;
  canPasteEntries: boolean;
  canCopyPath: boolean;
  canCopyRelativePath: boolean;
  canOpenInFileManager: boolean;
  contextBasePath: string;
  contextTargetPath: string;
  contextPasteDestination: string;
  handlers: {
    startCreateFile: (basePath: string) => void;
    startCreateFolder: (basePath: string) => void;
    rename: () => void | Promise<void>;
    delete: () => void | Promise<void>;
    copyEntry: () => void | Promise<void>;
    cutEntry: () => void | Promise<void>;
    pasteEntries: (destinationPath: string) => void | Promise<void>;
    copyPath: () => void | Promise<void>;
    copyRelativePath: () => void | Promise<void>;
    openInFileManager: () => void | Promise<void>;
  };
};

export type FileTreeShortcutContext = {
  event: KeyboardEvent<HTMLElement>;
  selectedEntryPath: string;
  canPasteEntries: boolean;
  canUndoLastEntryOperation: boolean;
  onCopyEntry?: (path: string) => void | Promise<void>;
  onCutEntry?: (path: string) => void | Promise<void>;
  onPasteEntries?: (destinationPath: string) => void | Promise<void>;
  onDeleteEntry?: (path: string) => void | Promise<void>;
  onUndoLastEntryOperation?: () => void | Promise<void>;
  resolveSelectedPasteDestination: () => string;
};

/** Registry describing context-menu actions, grouped so separators are generated automatically. */
export const DEFAULT_FILE_TREE_CONTEXT_ACTION_REGISTRY: readonly FileTreeContextActionDefinition[] = [
  {
    id: "create-file",
    group: "create",
    isVisible: (context) => context.canCreateAtContext,
    isDisabled: (context) => !context.canCreateFile,
    getLabel: (context) => context.labels.createFile,
    run: (context) => {
      context.handlers.startCreateFile(context.contextBasePath);
    },
  },
  {
    id: "create-folder",
    group: "create",
    isVisible: (context) => context.canCreateAtContext,
    isDisabled: (context) => !context.canCreateFolder,
    getLabel: (context) => context.labels.createFolder,
    run: (context) => {
      context.handlers.startCreateFolder(context.contextBasePath);
    },
  },
  {
    id: "rename",
    group: "edit",
    isVisible: () => true,
    isDisabled: (context) => !context.canRenameEntry || !context.contextTargetPath,
    getLabel: (context) => context.labels.rename,
    run: (context) => context.handlers.rename(),
  },
  {
    id: "delete",
    group: "edit",
    isVisible: () => true,
    isDisabled: (context) => !context.canDeleteEntry || !context.contextTargetPath,
    getLabel: (context) => context.labels.delete,
    run: (context) => context.handlers.delete(),
  },
  {
    id: "copy",
    group: "clipboard",
    isVisible: () => true,
    isDisabled: (context) => !context.canCopyEntry || !context.contextTargetPath,
    getLabel: (context) => context.labels.copy,
    run: (context) => context.handlers.copyEntry(),
  },
  {
    id: "cut",
    group: "clipboard",
    isVisible: () => true,
    isDisabled: (context) => !context.canCutEntry || !context.contextTargetPath,
    getLabel: (context) => context.labels.cut,
    run: (context) => context.handlers.cutEntry(),
  },
  {
    id: "paste",
    group: "clipboard",
    isVisible: () => true,
    isDisabled: (context) => !context.canPasteEntries,
    getLabel: (context) => context.labels.paste,
    run: (context) => context.handlers.pasteEntries(context.contextPasteDestination),
  },
  {
    id: "copy-path",
    group: "path",
    isVisible: () => true,
    isDisabled: (context) => !context.canCopyPath || !context.contextTargetPath,
    getLabel: (context) => context.labels.copyPath,
    run: (context) => context.handlers.copyPath(),
  },
  {
    id: "copy-relative-path",
    group: "path",
    isVisible: () => true,
    isDisabled: (context) => !context.canCopyRelativePath || !context.contextTargetPath,
    getLabel: (context) => context.labels.copyRelativePath,
    run: (context) => context.handlers.copyRelativePath(),
  },
  {
    id: "open-in-file-manager",
    group: "path",
    isVisible: () => true,
    isDisabled: (context) => !context.canOpenInFileManager || !context.contextTargetPath,
    getLabel: (context) => context.labels.openInFileManager,
    run: (context) => context.handlers.openInFileManager(),
  },
];

/** Registry describing tree keyboard shortcuts and their target actions. */
export const DEFAULT_FILE_TREE_SHORTCUT_ACTION_REGISTRY: readonly FileTreeShortcutDefinition[] = [
  {
    id: "undo",
    matches: (key) => key === "z",
    run: (context) => {
      if (context.event.shiftKey) {
        return;
      }
      if (!context.canUndoLastEntryOperation || !context.onUndoLastEntryOperation) {
        return;
      }

      context.event.preventDefault();
      return context.onUndoLastEntryOperation();
    },
  },
  {
    id: "copy",
    matches: (key) => key === "c",
    run: (context) => {
      if (!context.selectedEntryPath || !context.onCopyEntry) {
        return;
      }

      context.event.preventDefault();
      return context.onCopyEntry(context.selectedEntryPath);
    },
  },
  {
    id: "cut",
    matches: (key) => key === "x",
    run: (context) => {
      if (!context.selectedEntryPath || !context.onCutEntry) {
        return;
      }

      context.event.preventDefault();
      return context.onCutEntry(context.selectedEntryPath);
    },
  },
  {
    id: "paste",
    matches: (key) => key === "v",
    run: (context) => {
      if (!context.selectedEntryPath || !context.canPasteEntries || !context.onPasteEntries) {
        return;
      }

      context.event.preventDefault();
      return context.onPasteEntries(context.resolveSelectedPasteDestination());
    },
  },
  {
    id: "delete",
    matches: (key) => key === "backspace" || key === "delete",
    run: (context) => {
      if (!context.selectedEntryPath || !context.onDeleteEntry) {
        return;
      }

      context.event.preventDefault();
      return context.onDeleteEntry(context.selectedEntryPath);
    },
  },
];

/** Builds visible context-menu items from the action registry and inserts dividers between groups. */
export function buildFileTreeContextMenuItems(
  context: FileTreeContextMenuBuildContext,
  pluginContextActions: readonly FileTreeContextActionDefinition[] = [],
): FileTreeContextMenuItem[] {
  const actionRegistry = [...pluginContextActions, ...DEFAULT_FILE_TREE_CONTEXT_ACTION_REGISTRY];
  const items: FileTreeContextMenuItem[] = [];
  let previousGroup: FileTreeActionGroup | null = null;

  for (const action of actionRegistry) {
    if (!action.isVisible(context)) {
      continue;
    }

    if (previousGroup && previousGroup !== action.group) {
      items.push({
        kind: "divider",
        id: `divider-${previousGroup}-${action.group}`,
      });
    }

    items.push({
      kind: "action",
      id: action.id,
      label: action.getLabel(context),
      disabled: action.isDisabled(context),
      onSelect: () => action.run(context),
    });
    previousGroup = action.group;
  }

  return items;
}

/** Executes one matching file-tree shortcut from the shortcut registry. Returns true when handled. */
export async function handleFileTreeShortcutFromRegistry(
  context: FileTreeShortcutContext,
  pluginShortcutActions: readonly FileTreeShortcutDefinition[] = [],
): Promise<boolean> {
  const hasModifier = context.event.metaKey || context.event.ctrlKey;
  if (!hasModifier || context.event.altKey || context.event.repeat) {
    return false;
  }

  const pressedKey = context.event.key.toLowerCase();

  const shortcutRegistry = [...pluginShortcutActions, ...DEFAULT_FILE_TREE_SHORTCUT_ACTION_REGISTRY];

  for (const action of shortcutRegistry) {
    if (!action.matches(pressedKey)) {
      continue;
    }

    await action.run(context);
    return context.event.defaultPrevented;
  }

  return false;
}
