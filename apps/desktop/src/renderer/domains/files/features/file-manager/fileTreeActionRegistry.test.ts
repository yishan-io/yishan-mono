import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  type FileTreeContextActionDefinition,
  type FileTreeContextMenuBuildContext,
  type FileTreeShortcutContext,
  type FileTreeShortcutDefinition,
  buildFileTreeContextMenuItems,
  handleFileTreeShortcutFromRegistry,
} from "./fileTreeActionRegistry";

function createContextMenuBuildContext(): FileTreeContextMenuBuildContext {
  return {
    labels: {
      createFile: "Create File",
      createFolder: "Create Folder",
      rename: "Rename",
      delete: "Delete",
      copy: "Copy",
      cut: "Cut",
      paste: "Paste",
      copyPath: "Copy Path",
      copyRelativePath: "Copy Relative Path",
      openInFileManager: "Open in Finder",
    },
    canCreateAtContext: true,
    canCreateFile: true,
    canCreateFolder: true,
    canRenameEntry: true,
    canDeleteEntry: true,
    canCopyEntry: true,
    canCutEntry: true,
    canPasteEntries: true,
    canCopyPath: true,
    canCopyRelativePath: true,
    canOpenInFileManager: true,
    contextBasePath: "",
    contextTargetPath: "src/a.ts",
    contextPasteDestination: "src",
    handlers: {
      startCreateFile: vi.fn(),
      startCreateFolder: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      copyEntry: vi.fn(),
      cutEntry: vi.fn(),
      pasteEntries: vi.fn(),
      copyPath: vi.fn(),
      copyRelativePath: vi.fn(),
      openInFileManager: vi.fn(),
    },
  };
}

describe("fileTreeActionRegistry", () => {
  it("renders plugin context actions together with built-in actions", async () => {
    const pluginActionRun = vi.fn();
    const pluginAction: FileTreeContextActionDefinition = {
      id: "plugin-action",
      group: "create",
      isVisible: () => true,
      isDisabled: () => false,
      getLabel: () => "Plugin Action",
      run: pluginActionRun,
    };

    const items = buildFileTreeContextMenuItems(createContextMenuBuildContext(), [pluginAction]);

    const pluginItem = items.find((item) => item.kind === "action" && item.id === "plugin-action");
    expect(pluginItem).toBeTruthy();
    expect(items.some((item) => item.kind === "action" && item.id === "rename")).toBe(true);

    if (!pluginItem || pluginItem.kind !== "action") {
      throw new Error("Expected plugin action item.");
    }

    await pluginItem.onSelect();
    expect(pluginActionRun).toHaveBeenCalledTimes(1);
  });

  it("allows plugin shortcuts to override built-in shortcut handling", async () => {
    const onCopyEntry = vi.fn();
    let defaultPrevented = false;
    const eventState = {
      key: "c",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      repeat: false,
      defaultPrevented: false,
      preventDefault: () => {
        eventState.defaultPrevented = true;
        defaultPrevented = true;
      },
    };

    const context: FileTreeShortcutContext = {
      event: eventState as unknown as ReactKeyboardEvent<HTMLElement>,
      selectedEntryPath: "src/a.ts",
      canPasteEntries: true,
      canUndoLastEntryOperation: true,
      onCopyEntry,
      resolveSelectedPasteDestination: () => "src",
    };

    const pluginShortcut: FileTreeShortcutDefinition = {
      id: "plugin-copy",
      matches: (key) => key === "c",
      run: (shortcutContext) => {
        shortcutContext.event.preventDefault();
      },
    };

    const handled = await handleFileTreeShortcutFromRegistry(context, [pluginShortcut]);

    expect(handled).toBe(true);
    expect(defaultPrevented).toBe(true);
    expect(onCopyEntry).not.toHaveBeenCalled();
  });
});
