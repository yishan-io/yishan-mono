// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { getShortcutDefinitions } from "./keybindings";
import { compileShortcutDefinitions, processShortcuts } from "./shortcutRunner";
import type { ShortContext } from "./types";

function createShortcutContext(input: Partial<ShortContext> = {}): ShortContext {
  return {
    pathname: "/",
    isWorkspaceRoute: true,
    isPopupOpen: false,
    tabStoreState: {
      tabs: [],
      selectedTabId: "tab-1",
      selectedTabIdByWorkspaceId: {},
      getWorkspaceTabs: vi.fn(() => []),
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
      setAgentChatTabSession: vi.fn(),
      setTerminalTabAgentKind: vi.fn(),
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
    } as ShortContext["tabStoreState"],
    workspaceStoreState: {
      projects: [],
      workspaces: [],
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      gitChangesCountByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
      gitRefreshVersionByWorktreePath: {},
      fileTreeChangedRelativePathsByWorktreePath: {},
      selectedProjectId: "",
      selectedWorkspaceId: "workspace-1",
      displayProjectIds: [],
      fileTreeRefreshVersion: 0,
      setSelectedProjectId: vi.fn(),
      setSelectedWorkspaceId: vi.fn(),
      setDisplayProjectIds: vi.fn(),
      setLastUsedExternalAppId: vi.fn(),
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
      incrementGitRefreshVersion: vi.fn(),
    } as unknown as ShortContext["workspaceStoreState"],
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
    } as ShortContext["splitPaneStoreState"],
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
      openEntryInExternalApp: vi.fn(async () => {}),
    } as unknown as ShortContext["commands"],
    navigate: vi.fn(),
    ...input,
  };
}

describe("processShortcuts", () => {
  it("does not consume escape when the matched shortcut is not eligible to run", () => {
    const compiledDefinitions = compileShortcutDefinitions(getShortcutDefinitions(), true);
    const context = createShortcutContext({
      pathname: "/",
    });
    const target = document.createElement("textarea");
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = new KeyboardEvent("keydown", { key: "Escape" });

    Object.defineProperty(event, "target", { value: target });
    Object.defineProperty(event, "preventDefault", { value: preventDefault });
    Object.defineProperty(event, "stopPropagation", { value: stopPropagation });

    processShortcuts(compiledDefinitions, context, event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("consumes escape when the close-keybindings shortcut is eligible", () => {
    const compiledDefinitions = compileShortcutDefinitions(getShortcutDefinitions(), true);
    const navigate = vi.fn();
    const context = createShortcutContext({
      pathname: "/settings",
      isWorkspaceRoute: false,
      navigate,
    });
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = new KeyboardEvent("keydown", { key: "Escape" });

    Object.defineProperty(event, "preventDefault", { value: preventDefault });
    Object.defineProperty(event, "stopPropagation", { value: stopPropagation });

    processShortcuts(compiledDefinitions, context, event);

    expect(navigate).toHaveBeenCalledWith("/");
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});
