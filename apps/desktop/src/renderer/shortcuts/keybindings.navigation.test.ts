// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { ACTIONS } from "../../shared/contracts/actions";
import type { TabStoreState } from "../domains/workbench/state/tabStore";
import { getShortcutDefinitions } from "./keybindings";
import { createShortcutContext } from "./keybindings.testSupport";

vi.mock("@renderer/domains/browser", () => ({ reloadWebview: vi.fn() }));

describe("getShortcutDefinitions", () => {
  it("opens a new terminal tab from shortcut without reusing existing terminal tabs", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const openTerminal = runtimeDefinitions.find((definition) => definition.id === "open-terminal");
    expect(openTerminal).toBeTruthy();

    const openTab = vi.fn();
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        openTab,
      },
    });

    openTerminal?.run(context, new KeyboardEvent("keydown", { key: "T", metaKey: true }));

    expect(openTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "terminal",
      title: "terminal.title",
      reuseExisting: false,
    });
  });

  it("opens a new terminal tab from Cmd+T when focus is inside terminal surface", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const openTerminal = runtimeDefinitions.find((definition) => definition.id === "open-terminal");
    expect(openTerminal).toBeTruthy();

    const openTab = vi.fn();
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        openTab,
      },
    });

    const terminalSurface = document.createElement("div");
    terminalSurface.className = "xterm";
    const helperTextarea = document.createElement("textarea");
    terminalSurface.appendChild(helperTextarea);

    openTerminal?.run(context, {
      key: "t",
      metaKey: true,
      target: helperTextarea,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(openTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "terminal",
      title: "terminal.title",
      reuseExisting: false,
    });
  });

  it("opens a new terminal tab from shortcut even when focus is inside a regular editable", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const openTerminal = runtimeDefinitions.find((definition) => definition.id === "open-terminal");
    expect(openTerminal).toBeTruthy();

    const openTab = vi.fn();
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        openTab,
      },
    });

    const regularTextarea = document.createElement("textarea");

    openTerminal?.run(context, {
      key: "t",
      metaKey: true,
      target: regularTextarea,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(openTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "terminal",
      title: "terminal.title",
      reuseExisting: false,
    });
  });

  it("closes selected workspace from shortcut when focus is in repo/workspace list", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const closeSelectedWorkspace = runtimeDefinitions.find(
      (definition) => definition.id === "close-selected-workspace",
    );
    expect(closeSelectedWorkspace).toBeTruthy();

    const closeWorkspace = vi.fn(async () => undefined);
    const context = createShortcutContext();
    context.commands.closeWorkspace = closeWorkspace;
    const listRoot = document.createElement("div");
    listRoot.setAttribute("data-testid", "repo-workspace-list");
    const row = document.createElement("button");
    listRoot.appendChild(row);

    closeSelectedWorkspace?.run(
      context,
      new KeyboardEvent("keydown", { key: "W", metaKey: true, shiftKey: true, bubbles: true }),
    );

    closeSelectedWorkspace?.run(context, {
      key: "W",
      metaKey: true,
      shiftKey: true,
      target: row,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(closeWorkspace).toHaveBeenCalledTimes(1);
    expect(closeWorkspace).toHaveBeenCalledWith("workspace-1");
  });

  it("closes selected tab even when editable target is focused", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const closeTabDefinition = runtimeDefinitions.find((definition) => definition.id === "close-tab");
    expect(closeTabDefinition).toBeTruthy();

    const closeTab = vi.fn();
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        closeTab,
      },
    });

    const input = document.createElement("input");
    closeTabDefinition?.run(context, {
      key: "w",
      target: input,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(closeTab).toHaveBeenCalledWith("tab-1");
  });

  it("does not close selected tab for Ctrl+W when shortcut originates from terminal surface", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const closeTabDefinition = runtimeDefinitions.find((definition) => definition.id === "close-tab");
    expect(closeTabDefinition).toBeTruthy();

    const closeTab = vi.fn();
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        closeTab,
      },
    });

    const terminalSurface = document.createElement("div");
    terminalSurface.className = "xterm";
    const terminalCell = document.createElement("span");
    terminalSurface.appendChild(terminalCell);

    closeTabDefinition?.run(context, {
      key: "w",
      ctrlKey: true,
      target: terminalCell,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(closeTab).not.toHaveBeenCalled();
  });

  it("closes selected tab for Cmd+W when shortcut originates from terminal surface", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const closeTabDefinition = runtimeDefinitions.find((definition) => definition.id === "close-tab");
    expect(closeTabDefinition).toBeTruthy();

    const closeTab = vi.fn();
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        closeTab,
      },
    });

    const terminalSurface = document.createElement("div");
    terminalSurface.className = "xterm";
    const terminalCell = document.createElement("span");
    terminalSurface.appendChild(terminalCell);

    closeTabDefinition?.run(context, {
      key: "w",
      metaKey: true,
      target: terminalCell,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(closeTab).toHaveBeenCalledWith("tab-1");
  });

  it("selects workspace tab by index even when editable target is focused", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const selectByIndexDefinition = runtimeDefinitions.find((definition) => definition.id === "select-tab-by-index");
    expect(selectByIndexDefinition).toBeTruthy();

    const selectTabCmd = vi.fn();
    const getActivePane = vi.fn(() => ({
      kind: "leaf" as const,
      id: "active-pane-1",
      tabIds: ["tab-1", "tab-2"],
      selectedTabId: "tab-1",
    }));
    const selectTab = vi.fn();
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        selectTab: selectTabCmd,
      },
      tabStoreState: {
        ...createShortcutContext().tabStoreState,
        getWorkspaceTabs: vi.fn<(workspaceId: string) => TabStoreState["tabs"]>(() => [
          {
            id: "tab-1",
            workspaceId: "workspace-1",
            title: "Tab 1",
            pinned: false,
            kind: "browser",
            data: { url: "" },
          },
          {
            id: "tab-2",
            workspaceId: "workspace-1",
            title: "Tab 2",
            pinned: false,
            kind: "browser",
            data: { url: "" },
          },
        ]),
      },
      splitPaneStoreState: {
        ...createShortcutContext().splitPaneStoreState,
        getActivePane,
        selectTab,
      },
    });

    const input = document.createElement("input");
    selectByIndexDefinition?.run(context, {
      key: "2",
      target: input,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(getActivePane).toHaveBeenCalledWith("workspace-1");
    expect(selectTab).toHaveBeenCalledWith("workspace-1", "active-pane-1", "tab-2");
    expect(selectTabCmd).toHaveBeenCalledWith("tab-2");
  });

  it("selects tabs by the same pinned-first order shown in the active pane", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const selectByIndexDefinition = runtimeDefinitions.find((definition) => definition.id === "select-tab-by-index");
    expect(selectByIndexDefinition).toBeTruthy();

    const selectTabCmd = vi.fn();
    const getActivePane = vi.fn(() => ({
      kind: "leaf" as const,
      id: "active-pane-1",
      tabIds: ["tab-2", "tab-1"],
      selectedTabId: "tab-2",
    }));
    const selectTab = vi.fn();
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        selectTab: selectTabCmd,
      },
      tabStoreState: {
        ...createShortcutContext().tabStoreState,
        getWorkspaceTabs: vi.fn<(workspaceId: string) => TabStoreState["tabs"]>(() => [
          {
            id: "tab-1",
            workspaceId: "workspace-1",
            title: "Pinned",
            pinned: true,
            kind: "browser",
            data: { url: "" },
          },
          {
            id: "tab-2",
            workspaceId: "workspace-1",
            title: "Regular",
            pinned: false,
            kind: "browser",
            data: { url: "" },
          },
        ]),
      },
      splitPaneStoreState: {
        ...createShortcutContext().splitPaneStoreState,
        getActivePane,
        selectTab,
      },
    });

    selectByIndexDefinition?.run(context, {
      key: "1",
      target: document.body,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(selectTab).toHaveBeenCalledWith("workspace-1", "active-pane-1", "tab-1");
    expect(selectTabCmd).toHaveBeenCalledWith("tab-1");
  });
  it("ignores file-tree delete shortcut when editable target is focused", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const deleteAction = runtimeDefinitions.find((definition) => definition.id === ACTIONS.FILE_DELETE);
    expect(deleteAction).toBeTruthy();

    const deleteSelectedFileTreeEntry = vi.fn();
    const context = createShortcutContext();
    context.commands.deleteSelectedFileTreeEntry = deleteSelectedFileTreeEntry;
    const input = document.createElement("input");

    deleteAction?.run(context, {
      key: "Backspace",
      metaKey: true,
      target: input,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(deleteSelectedFileTreeEntry).not.toHaveBeenCalled();
  });

  it("ignores file-tree delete shortcut when keydown target is within tree area", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const deleteAction = runtimeDefinitions.find((definition) => definition.id === ACTIONS.FILE_DELETE);
    expect(deleteAction).toBeTruthy();

    const deleteSelectedFileTreeEntry = vi.fn();
    const context = createShortcutContext();
    context.commands.deleteSelectedFileTreeEntry = deleteSelectedFileTreeEntry;
    const treeArea = document.createElement("div");
    treeArea.setAttribute("data-testid", "repo-file-tree-area");
    const treeChild = document.createElement("span");
    treeArea.appendChild(treeChild);

    deleteAction?.run(context, {
      key: "Delete",
      metaKey: true,
      target: treeChild,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(deleteSelectedFileTreeEntry).not.toHaveBeenCalled();
  });
});
