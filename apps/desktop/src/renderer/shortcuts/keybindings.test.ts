// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { ACTIONS } from "../../shared/contracts/actions";
import type { TabStoreState } from "../store/tabStore";
import type { WorkspaceStoreState } from "../store/workspaceStore";
import { SUPPORTED_KEY_BINDINGS, type ShortContext, getShortcutDefinitions } from "./keybindings";

/** Creates a complete shortcut context with overridable test doubles. */
function createShortcutContext(input: Partial<ShortContext> = {}): ShortContext {
  return {
    pathname: "/",
    isWorkspaceRoute: true,
    tabStoreState: {
      tabs: [{ id: "tab-1", workspaceId: "workspace-1", title: "Tab 1", pinned: false, kind: "session", data: {} }],
      selectedWorkspaceId: "workspace-1",
      selectedTabId: "tab-1",
      selectedTabIdByWorkspaceId: {},
      getWorkspaceTabs: vi.fn(() => [
        { id: "tab-1", workspaceId: "workspace-1", title: "Tab 1", pinned: false, kind: "session", data: {} },
      ]),
      setSelectedWorkspaceId: vi.fn(),
      setSelectedTabId: vi.fn(),
      retainWorkspaceTabs: vi.fn(() => []),
      createTab: vi.fn(async () => undefined),
      resolveSessionTab: vi.fn(),
      failSessionTabInit: vi.fn(),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      setTerminalTabSessionId: vi.fn(),
      toggleTabPinned: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
    } as TabStoreState,
    workspaceStoreState: {
      repos: [],
      workspaces: [],
      gitChangesCountByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
      gitRefreshVersionByWorktreePath: {},
      fileTreeChangedRelativePathsByWorktreePath: {},
      selectedRepoId: "",
      selectedWorkspaceId: "workspace-1",
      displayRepoIds: [],
      leftWidth: 300,
      rightWidth: 360,
      fileTreeRefreshVersion: 0,
      setSelectedRepoId: vi.fn(),
      setSelectedWorkspaceId: vi.fn(),
      setDisplayRepoIds: vi.fn(),
      setLastUsedExternalAppId: vi.fn(),
      setLeftWidth: vi.fn(),
      setRightWidth: vi.fn(),
      load: vi.fn(),
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      updateProjectConfig: vi.fn(),
      incrementFileTreeRefreshVersion: vi.fn(),
      addWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      renameWorkspaceBranch: vi.fn(),
      setWorkspaceGitChangesCount: vi.fn(),
      setWorkspaceGitChangeTotals: vi.fn(),
      incrementGitRefreshVersion: vi.fn(),
    } as WorkspaceStoreState,
    terminalTabTitle: "terminal.title",
    commands: {
      setSelectedRepoId: vi.fn(),
      setSelectedWorkspaceId: vi.fn(),
      load: vi.fn(async () => {}),
      createProject: vi.fn(async () => {}),
      deleteProject: vi.fn(async () => {}),
      updateProjectConfig: vi.fn(async () => {}),
      createWorkspace: vi.fn(async () => {}),
      closeWorkspace: vi.fn(async () => {}),
      refreshWorkspaceGitChanges: vi.fn(async () => {}),
      setSelectedTabId: vi.fn(),
      createTab: vi.fn(async () => {}),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      toggleTabPinned: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
      setDisplayRepoIds: vi.fn(),
      setLeftWidth: vi.fn(),
      setRightWidth: vi.fn(),
      toggleLeftPaneVisibility: vi.fn(),
      toggleRightPaneVisibility: vi.fn(),
      activateWorkspacePane: vi.fn(),
      openCreateWorkspaceDialog: vi.fn(),
      focusWorkspaceFileTree: vi.fn(),
      openWorkspaceFileSearch: vi.fn(),
      renameWorkspace: vi.fn(),
      renameWorkspaceBranch: vi.fn(),
    } as unknown as ShortContext["commands"],
    navigate: vi.fn(),
    ...input,
  };
}

describe("SUPPORTED_KEY_BINDINGS", () => {
  it("documents delete-selected-file-tree-entry as delete/backspace on both platforms", () => {
    const deleteBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === ACTIONS.FILE_DELETE);
    expect(deleteBinding).toBeTruthy();

    expect(deleteBinding?.macKeys).toEqual(["⌘", "DELETE/BACKSPACE"]);
    expect(deleteBinding?.windowsKeys).toEqual(["CTRL", "DELETE/BACKSPACE"]);
  });

  it("documents undo-file-tree-operation as mod+z on both platforms", () => {
    const undoBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === ACTIONS.FILE_UNDO);
    expect(undoBinding).toBeTruthy();

    expect(undoBinding?.macKeys).toEqual(["⌘", "Z"]);
    expect(undoBinding?.windowsKeys).toEqual(["CTRL", "Z"]);
  });

  it("documents select-tab-by-index as 1-9 range on both platforms", () => {
    const selectByIndexBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "select-tab-by-index");
    expect(selectByIndexBinding).toBeTruthy();

    expect(selectByIndexBinding?.macKeys).toEqual(["⌘", "1-9"]);
    expect(selectByIndexBinding?.windowsKeys).toEqual(["CTRL", "1-9"]);
  });

  it("documents pane toggles as mod+b and mod+l", () => {
    const leftPaneBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "toggle-left-pane");
    const rightPaneBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "toggle-right-pane");

    expect(leftPaneBinding?.macKeys).toEqual(["⌘", "B"]);
    expect(leftPaneBinding?.windowsKeys).toEqual(["CTRL", "B"]);
    expect(rightPaneBinding?.macKeys).toEqual(["⌘", "L"]);
    expect(rightPaneBinding?.windowsKeys).toEqual(["CTRL", "L"]);
  });

  it("documents chat and terminal tabs as mod+y and mod+t", () => {
    const chatBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "new-tab");
    const terminalBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "open-terminal");

    expect(chatBinding?.macKeys).toEqual(["⌘", "Y"]);
    expect(chatBinding?.windowsKeys).toEqual(["CTRL", "Y"]);
    expect(terminalBinding?.macKeys).toEqual(["⌘", "T"]);
    expect(terminalBinding?.windowsKeys).toEqual(["CTRL", "T"]);
  });

  it("documents close-selected-workspace as mod+shift+w", () => {
    const closeWorkspaceBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "close-selected-workspace");

    expect(closeWorkspaceBinding?.macKeys).toEqual(["⌘", "SHIFT", "W"]);
    expect(closeWorkspaceBinding?.windowsKeys).toEqual(["CTRL", "SHIFT", "W"]);
  });

  it("documents create-workspace as mod+n", () => {
    const createWorkspaceBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "create-workspace");

    expect(createWorkspaceBinding?.macKeys).toEqual(["⌘", "N"]);
    expect(createWorkspaceBinding?.windowsKeys).toEqual(["CTRL", "N"]);
  });
});

describe("getShortcutDefinitions", () => {
  it("exposes runtime hotkeys metadata and handlers", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    expect(runtimeDefinitions.length).toBeGreaterThan(0);

    const openKeybindings = runtimeDefinitions.find((definition) => definition.id === "open-keybindings");
    expect(openKeybindings).toBeTruthy();
    expect(openKeybindings?.keys).toBe("ctrl+/,command+/");
    expect(typeof openKeybindings?.run).toBe("function");
  });

  it("dispatches open file search from the central definition", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const openFileSearch = runtimeDefinitions.find((definition) => definition.id === "open-file-search");
    expect(openFileSearch).toBeTruthy();

    const openWorkspaceFileSearch = vi.fn();
    const context = createShortcutContext();
    context.commands.openWorkspaceFileSearch = openWorkspaceFileSearch;

    openFileSearch?.run(context, new KeyboardEvent("keydown", { key: "p", metaKey: true }));

    expect(openWorkspaceFileSearch).toHaveBeenCalledTimes(1);
  });

  it("dispatches pane visibility toggles from central definitions", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const leftPaneToggle = runtimeDefinitions.find((definition) => definition.id === "toggle-left-pane");
    const rightPaneToggle = runtimeDefinitions.find((definition) => definition.id === "toggle-right-pane");
    expect(leftPaneToggle).toBeTruthy();
    expect(rightPaneToggle).toBeTruthy();

    const toggleLeftPaneVisibility = vi.fn();
    const toggleRightPaneVisibility = vi.fn();
    const context = createShortcutContext();
    context.commands.toggleLeftPaneVisibility = toggleLeftPaneVisibility;
    context.commands.toggleRightPaneVisibility = toggleRightPaneVisibility;

    leftPaneToggle?.run(context, new KeyboardEvent("keydown", { key: "b", metaKey: true }));
    rightPaneToggle?.run(context, new KeyboardEvent("keydown", { key: "l", metaKey: true }));

    expect(toggleLeftPaneVisibility).toHaveBeenCalledTimes(1);
    expect(toggleRightPaneVisibility).toHaveBeenCalledTimes(1);
  });

  it("focuses file tree from the activate-files-pane shortcut", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const activateFilesPane = runtimeDefinitions.find((definition) => definition.id === "activate-files-pane");
    expect(activateFilesPane).toBeTruthy();

    const focusWorkspaceFileTree = vi.fn();
    const context = createShortcutContext();
    context.commands.focusWorkspaceFileTree = focusWorkspaceFileTree;

    activateFilesPane?.run(context, new KeyboardEvent("keydown", { key: "F", metaKey: true, shiftKey: true }));

    expect(focusWorkspaceFileTree).toHaveBeenCalledTimes(1);
  });

  it("focuses file tree from activate-files-pane even when editable target is focused", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const activateFilesPane = runtimeDefinitions.find((definition) => definition.id === "activate-files-pane");
    expect(activateFilesPane).toBeTruthy();

    const focusWorkspaceFileTree = vi.fn();
    const context = createShortcutContext();
    context.commands.focusWorkspaceFileTree = focusWorkspaceFileTree;
    const input = document.createElement("input");

    activateFilesPane?.run(context, {
      key: "F",
      metaKey: true,
      shiftKey: true,
      target: input,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(focusWorkspaceFileTree).toHaveBeenCalledTimes(1);
  });

  it("opens create-workspace dialog from shortcut", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const createWorkspaceShortcut = runtimeDefinitions.find((definition) => definition.id === "create-workspace");
    expect(createWorkspaceShortcut).toBeTruthy();

    const openCreateWorkspaceDialog = vi.fn();
    const context = createShortcutContext();
    context.commands.openCreateWorkspaceDialog = openCreateWorkspaceDialog;

    createWorkspaceShortcut?.run(context, new KeyboardEvent("keydown", { key: "N", metaKey: true }));

    expect(openCreateWorkspaceDialog).toHaveBeenCalledTimes(1);
  });

  it("dispatches file-tree delete action from the central definition", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const deleteAction = runtimeDefinitions.find((definition) => definition.id === ACTIONS.FILE_DELETE);
    expect(deleteAction).toBeTruthy();

    const deleteSelectedFileTreeEntry = vi.fn();
    const context = createShortcutContext();
    context.commands.deleteSelectedFileTreeEntry = deleteSelectedFileTreeEntry;

    deleteAction?.run(context, new KeyboardEvent("keydown", { key: "Backspace", metaKey: true }));

    expect(deleteSelectedFileTreeEntry).toHaveBeenCalledTimes(1);
  });

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

    const setSelectedTabId = vi.fn();
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        setSelectedTabId,
      },
      tabStoreState: {
        ...createShortcutContext().tabStoreState,
        getWorkspaceTabs: vi.fn<(workspaceId: string) => TabStoreState["tabs"]>(() => [
          { id: "tab-1", workspaceId: "workspace-1", title: "Tab 1", pinned: false, kind: "session", data: {} },
          { id: "tab-2", workspaceId: "workspace-1", title: "Tab 2", pinned: false, kind: "session", data: {} },
        ]),
      },
    });

    const input = document.createElement("input");
    selectByIndexDefinition?.run(context, {
      key: "2",
      target: input,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(setSelectedTabId).toHaveBeenCalledWith("tab-2");
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
