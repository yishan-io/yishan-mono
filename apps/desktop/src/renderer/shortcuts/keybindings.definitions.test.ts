// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIONS } from "../../shared/contracts/actions";
import { projectStore } from "../domains/project/state/projectStore";
import type { TabStoreState } from "../domains/workbench/state/tabStore";
import type { WorkspaceStoreState } from "../domains/workspace/state/workspaceStore";
import { getShortcutDefinitions } from "./keybindings";
import { createShortcutContext } from "./keybindings.testSupport";

vi.mock("@renderer/domains/browser", () => ({ reloadWebview: vi.fn() }));
const initialProjectStoreState = projectStore.getState();
afterEach(() => projectStore.setState(initialProjectStoreState, true));

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

  it("requests focus for the active agent chat composer", () => {
    const runtimeDefinitions = getShortcutDefinitions();
    const focusAgentChatComposer = runtimeDefinitions.find(
      (definition) => definition.id === "focus-agent-chat-composer",
    );
    expect(focusAgentChatComposer).toBeTruthy();

    const handler = vi.fn();
    window.addEventListener("yishan-tab-focus-request", handler);
    const context = createShortcutContext({
      tabStoreState: {
        ...createShortcutContext().tabStoreState,
        tabs: [
          {
            id: "tab-agent-chat",
            workspaceId: "workspace-1",
            title: "Agent Chat",
            pinned: false,
            kind: "agent-chat",
            data: { userRenamed: true },
          },
        ],
        selectedTabId: "tab-agent-chat",
      } as TabStoreState,
    });

    focusAgentChatComposer?.run(context, new KeyboardEvent("keydown", { key: "l", metaKey: true }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[0] as CustomEvent<{ tabId: string; target: string; kind: string }>).detail).toEqual(
      { tabId: "tab-agent-chat", target: "agent-composer", kind: "manual" },
    );
    window.removeEventListener("yishan-tab-focus-request", handler);
  });

  it("reloads the active browser tab from Cmd+R shortcut", async () => {
    const { reloadWebview } = await import("@renderer/domains/browser");
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
    const { reloadWebview } = await import("@renderer/domains/browser");
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
    projectStore.setState({
      lastUsedExternalAppId: "cursor" as never,
    });
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
});
