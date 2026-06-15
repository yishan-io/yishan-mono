// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { ACTIONS } from "../../shared/contracts/actions";
import type { SplitPaneStoreState } from "../store/splitPaneStore";
import type { TabStoreState } from "../store/tabStore";
import type { WorkspaceStoreState } from "../store/workspaceStore";
import { SUPPORTED_KEY_BINDINGS, type ShortContext, getShortcutDefinitions } from "./keybindings";

vi.mock("../views/workspace/browser/webviewRegistry", () => ({
  reloadWebview: vi.fn(),
}));

/** Creates a complete shortcut context with overridable test doubles. */
function createShortcutContext(input: Partial<ShortContext> = {}): ShortContext {
  return {
    pathname: "/",
    isWorkspaceRoute: true,
    isPopupOpen: false,
    tabStoreState: {
      tabs: [{ id: "tab-1", workspaceId: "workspace-1", title: "Tab 1", pinned: false, kind: "session", data: {} }],
      selectedTabId: "tab-1",
      selectedTabIdByWorkspaceId: {},
      getWorkspaceTabs: vi.fn(() => [
        { id: "tab-1", workspaceId: "workspace-1", title: "Tab 1", pinned: false, kind: "session", data: {} },
      ]),
      resolveTabForWorkspace: vi.fn(),
      selectTab: vi.fn(),
      retainWorkspaceTabs: vi.fn(() => []),
      createTab: vi.fn(async () => undefined),
      resolveSessionTab: vi.fn(),
      failSessionTabInit: vi.fn(),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      closeAllTerminalTabs: vi.fn(),
      setTerminalTabSessionId: vi.fn(),
      setBrowserTabFaviconUrl: vi.fn(),
      setBrowserTabUrl: vi.fn(),
      toggleTabPinned: vi.fn(),
      promoteTemporaryTab: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      renameTabsForEntryRename: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
      refreshFileTabFromDisk: vi.fn(),
      refreshDiffTabContent: vi.fn(),
    } as TabStoreState,
    workspaceStoreState: {
      projects: [],
      workspaces: [],
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      currentBranchByWorkspaceId: {},
      gitChangesCountByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
      gitRefreshVersionByWorktreePath: {},
      fileTreeChangedRelativePathsByWorktreePath: {},
      selectedProjectId: "",
      selectedWorkspaceId: "workspace-1",
      displayProjectIds: [],
      isProjectsLoaded: true,
      lastUsedExternalAppId: undefined,
      organizationPreferencesById: {},
      fileTreeRefreshVersion: 0,
      workspaceListHierarchyMode: "by_project",
      setSelectedProjectId: vi.fn(),
      setSelectedWorkspaceId: vi.fn(),
      setDisplayProjectIds: vi.fn(),
      setLastUsedExternalAppId: vi.fn(),
      setWorkspaceListHierarchyMode: vi.fn(),
      load: vi.fn(),
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      updateProjectConfig: vi.fn(),
      incrementFileTreeRefreshVersion: vi.fn(),
      addWorkspace: vi.fn(),
      removeWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      renameWorkspaceBranch: vi.fn(),
      reorderWorkspace: vi.fn(),
      setWorkspaceGitChangesCount: vi.fn(),
      setWorkspaceGitChangeTotals: vi.fn(),
      setWorkspacePullRequest: vi.fn(),
      setWorkspaceCurrentBranch: vi.fn(),
      incrementGitRefreshVersion: vi.fn(),
    } as WorkspaceStoreState,

    splitPaneStoreState: {
      layoutByWorkspaceId: {},
      getLayout: vi.fn(),
      getActivePane: vi.fn(() => null),
      getPane: vi.fn(() => null),
      getPaneForTab: vi.fn(() => null),
      getAllPanes: vi.fn(() => []),
      setActivePane: vi.fn(),
      selectTab: vi.fn(),
      registerTabInPane: vi.fn(),
      unregisterTabFromPane: vi.fn(),
      splitPane: vi.fn(),
      moveTab: vi.fn(),
      reorderTab: vi.fn(),
      updateSplitRatio: vi.fn(),
    } as SplitPaneStoreState,
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
      selectTab: vi.fn(),
      createTab: vi.fn(async () => {}),
      openTab: vi.fn(),
      closeTab: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeAllTabs: vi.fn(),
      toggleTabPinned: vi.fn(),
      promoteTemporaryTab: vi.fn(),
      reorderTab: vi.fn(),
      renameTab: vi.fn(),
      updateFileTabContent: vi.fn(),
      markFileTabSaved: vi.fn(),
      refreshFileTabFromDisk: vi.fn(),
      refreshDiffTabContent: vi.fn(),
      setDisplayRepoIds: vi.fn(),
      setLeftPaneWidth: vi.fn(),
      setRightPaneWidth: vi.fn(),
      toggleLeftPaneVisibility: vi.fn(),
      toggleRightPaneVisibility: vi.fn(),
      activateWorkspacePane: vi.fn(),
      openCreateWorkspaceDialog: vi.fn(),
      focusWorkspaceFileTree: vi.fn(),
      openWorkspaceFileSearch: vi.fn(),
      renameWorkspace: vi.fn(),
      reorderWorkspace: vi.fn(),
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

  it("documents left pane toggle as mod+b", () => {
    const leftPaneBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "toggle-left-pane");

    expect(leftPaneBinding?.macKeys).toEqual(["⌘", "B"]);
    expect(leftPaneBinding?.windowsKeys).toEqual(["CTRL", "B"]);
  });

  it("documents chat and terminal tabs as mod+y and mod+t", () => {
    const chatBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "new-tab");
    const terminalBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "open-terminal");
    const browserBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "open-browser");

    expect(chatBinding?.macKeys).toEqual(["⌘", "Y"]);
    expect(chatBinding?.windowsKeys).toEqual(["CTRL", "Y"]);
    expect(terminalBinding?.macKeys).toEqual(["⌘", "T"]);
    expect(terminalBinding?.windowsKeys).toEqual(["CTRL", "T"]);
    expect(browserBinding?.macKeys).toEqual(["⌘", "⇧", "B"]);
    expect(browserBinding?.windowsKeys).toEqual(["CTRL", "⇧", "B"]);
  });

  it("documents close-selected-workspace as mod+shift+w", () => {
    const closeWorkspaceBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "close-selected-workspace");

    expect(closeWorkspaceBinding?.macKeys).toEqual(["⌘", "⇧", "W"]);
    expect(closeWorkspaceBinding?.windowsKeys).toEqual(["CTRL", "⇧", "W"]);
  });

  it("documents create-workspace as mod+n", () => {
    const createWorkspaceBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "create-workspace");

    expect(createWorkspaceBinding?.macKeys).toEqual(["⌘", "N"]);
    expect(createWorkspaceBinding?.windowsKeys).toEqual(["CTRL", "N"]);
  });

  it("documents open-selected-file-in-external-app as mod+o", () => {
    const openFileBinding = SUPPORTED_KEY_BINDINGS.find(
      (binding) => binding.id === ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP,
    );

    expect(openFileBinding?.macKeys).toEqual(["⌘", "O"]);
    expect(openFileBinding?.windowsKeys).toEqual(["CTRL", "O"]);
  });

  it("documents reload-browser-tab as mod+r", () => {
    const reloadBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "reload-browser-tab");

    expect(reloadBinding?.macKeys).toEqual(["⌘", "R"]);
    expect(reloadBinding?.windowsKeys).toEqual(["CTRL", "R"]);
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

  it("applies valid key overrides and ignores invalid overrides", () => {
    const runtimeDefinitions = getShortcutDefinitions({
      "open-keybindings": "command+k",
      "open-file-search": "mod+p",
    });

    const openKeybindings = runtimeDefinitions.find((definition) => definition.id === "open-keybindings");
    const openFileSearch = runtimeDefinitions.find((definition) => definition.id === "open-file-search");

    expect(openKeybindings?.keys).toBe("command+k");
    expect(openFileSearch?.keys).toBe("ctrl+p,command+p");
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

  it("dispatches open browser tab from the central definition", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const openBrowser = runtimeDefinitions.find((definition) => definition.id === "open-browser");
    expect(openBrowser).toBeTruthy();

    const openTab = vi.fn();
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        openTab,
      },
    });

    openBrowser?.run(context, new KeyboardEvent("keydown", { key: "B", metaKey: true, shiftKey: true }));

    expect(openTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "browser",
      url: "",
      reuseExisting: false,
    });
  });

  it("reloads the active browser tab from Cmd+R shortcut", async () => {
    const { reloadWebview } = await import("../views/workspace/browser/webviewRegistry");
    const reloadWebviewMock = vi.mocked(reloadWebview);
    reloadWebviewMock.mockClear();

    const runtimeDefinitions = getShortcutDefinitions();
    const reloadBrowser = runtimeDefinitions.find((definition) => definition.id === "reload-browser-tab");
    expect(reloadBrowser).toBeTruthy();

    const context = createShortcutContext({
      tabStoreState: {
        ...createShortcutContext().tabStoreState,
        selectedTabId: "tab-browser",
        tabs: [
          {
            id: "tab-browser",
            workspaceId: "workspace-1",
            title: "Browser",
            pinned: false,
            kind: "browser",
            data: { url: "https://example.com" },
          },
        ],
      } as TabStoreState,
    });

    reloadBrowser?.run(context, new KeyboardEvent("keydown", { key: "r", metaKey: true }));

    expect(reloadWebviewMock).toHaveBeenCalledWith("tab-browser");
  });

  it("does not reload browser tab when selected tab is not a browser tab", async () => {
    const { reloadWebview } = await import("../views/workspace/browser/webviewRegistry");
    const reloadWebviewMock = vi.mocked(reloadWebview);
    reloadWebviewMock.mockClear();

    const runtimeDefinitions = getShortcutDefinitions();
    const reloadBrowser = runtimeDefinitions.find((definition) => definition.id === "reload-browser-tab");
    expect(reloadBrowser).toBeTruthy();

    const context = createShortcutContext();

    reloadBrowser?.run(context, new KeyboardEvent("keydown", { key: "r", metaKey: true }));

    expect(reloadWebviewMock).not.toHaveBeenCalled();
  });

  it("opens selected file tab in latest external app from shortcut", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const openSelectedFile = runtimeDefinitions.find(
      (definition) => definition.id === ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP,
    );
    expect(openSelectedFile).toBeTruthy();

    const openEntryInExternalApp = vi.fn(async () => ({ ok: true as const }));
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        openEntryInExternalApp,
      },
      workspaceStoreState: {
        ...createShortcutContext().workspaceStoreState,
        lastUsedExternalAppId: "cursor",
        workspaces: [
          {
            id: "workspace-1",
            repoId: "repo-1",
            name: "Workspace 1",
            title: "Workspace 1",
            sourceBranch: "main",
            branch: "feature",
            summaryId: "summary-1",
            worktreePath: "/tmp/workspace-1",
          },
        ],
      } as WorkspaceStoreState,
      tabStoreState: {
        ...createShortcutContext().tabStoreState,
        selectedTabId: "tab-file",
        tabs: [
          {
            id: "tab-file",
            workspaceId: "workspace-1",
            title: "App.tsx",
            pinned: false,
            kind: "file",
            data: {
              path: "src/App.tsx",
              content: "",
              savedContent: "",
              isDirty: false,
              isTemporary: false,
            },
          },
        ],
      } as TabStoreState,
    });

    openSelectedFile?.run(context, new KeyboardEvent("keydown", { key: "O", metaKey: true }));

    expect(openEntryInExternalApp).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/workspace-1",
      appId: "cursor",
    });
  });

  it("falls back to file manager for open selected file shortcut without latest external app", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const openSelectedFile = runtimeDefinitions.find(
      (definition) => definition.id === ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP,
    );
    const openEntryInExternalApp = vi.fn(async () => ({ ok: true as const }));
    const context = createShortcutContext({
      commands: {
        ...createShortcutContext().commands,
        openEntryInExternalApp,
      },
      workspaceStoreState: {
        ...createShortcutContext().workspaceStoreState,
        workspaces: [
          {
            id: "workspace-1",
            repoId: "repo-1",
            name: "Workspace 1",
            title: "Workspace 1",
            sourceBranch: "main",
            branch: "feature",
            summaryId: "summary-1",
            worktreePath: "/tmp/workspace-1",
          },
        ],
      } as WorkspaceStoreState,
      tabStoreState: {
        ...createShortcutContext().tabStoreState,
        selectedTabId: "tab-file",
        tabs: [
          {
            id: "tab-file",
            workspaceId: "workspace-1",
            title: "App.tsx",
            pinned: false,
            kind: "file",
            data: {
              path: "src/App.tsx",
              content: "",
              savedContent: "",
              isDirty: false,
              isTemporary: false,
            },
          },
        ],
      } as TabStoreState,
    });

    openSelectedFile?.run(context, new KeyboardEvent("keydown", { key: "O", metaKey: true }));

    expect(openEntryInExternalApp).toHaveBeenCalledWith({
      workspaceWorktreePath: "/tmp/workspace-1",
      appId: "system-file-manager",
    });
  });

  it("dispatches left pane visibility toggle from central definitions", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const leftPaneToggle = runtimeDefinitions.find((definition) => definition.id === "toggle-left-pane");
    expect(leftPaneToggle).toBeTruthy();

    const toggleLeftPaneVisibility = vi.fn();
    const context = createShortcutContext();
    context.commands.toggleLeftPaneVisibility = toggleLeftPaneVisibility;

    leftPaneToggle?.run(context, new KeyboardEvent("keydown", { key: "b", metaKey: true }));

    expect(toggleLeftPaneVisibility).toHaveBeenCalledTimes(1);
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
          { id: "tab-1", workspaceId: "workspace-1", title: "Tab 1", pinned: false, kind: "session", data: {} },
          { id: "tab-2", workspaceId: "workspace-1", title: "Tab 2", pinned: false, kind: "session", data: {} },
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
          { id: "tab-1", workspaceId: "workspace-1", title: "Pinned", pinned: true, kind: "session", data: {} },
          { id: "tab-2", workspaceId: "workspace-1", title: "Regular", pinned: false, kind: "session", data: {} },
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
