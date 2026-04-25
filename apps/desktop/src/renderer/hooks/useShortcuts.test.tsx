// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShortcuts } from "./useShortcuts";

const mocks = vi.hoisted(() => ({
  getShortcutDefinitions: vi.fn(),
  tabStoreState: {
    tabs: [
      {
        id: "tab-1",
        workspaceId: "workspace-1",
        title: "Tab 1",
        pinned: false,
        kind: "session",
        data: {},
      },
    ],
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
    toggleTabPinned: vi.fn(),
    reorderTab: vi.fn(),
    renameTab: vi.fn(),
    updateFileTabContent: vi.fn(),
    markFileTabSaved: vi.fn(),
  },
  workspaceStoreState: {
    projects: [],
    workspaces: [],
    gitChangesCountByWorkspaceId: {},
    gitChangeTotalsByWorkspaceId: {},
    gitRefreshVersionByWorktreePath: {},
    fileTreeChangedRelativePathsByWorktreePath: {},
    selectedProjectId: "",
    selectedWorkspaceId: "workspace-1",
    displayProjectIds: [],
    leftWidth: 300,
    rightWidth: 360,
    fileTreeRefreshVersion: 0,
    setSelectedProjectId: vi.fn(),
    setSelectedWorkspaceId: vi.fn(),
    setDisplayProjectIds: vi.fn(),
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
  },
  commandHandlers: {
    createTab: vi.fn(),
    closeTab: vi.fn(),
    openTab: vi.fn(),
    setSelectedTabId: vi.fn(),
  },
}));

vi.mock("../shortcuts/keybindings", () => ({
  getShortcutDefinitions: mocks.getShortcutDefinitions,
}));

vi.mock("../store/workspaceStore", () => ({
  workspaceStore: (selector: (state: typeof mocks.workspaceStoreState) => unknown) =>
    selector(mocks.workspaceStoreState),
}));

vi.mock("../store/tabStore", () => ({
  tabStore: (selector: (state: typeof mocks.tabStoreState) => unknown) => selector(mocks.tabStoreState),
}));

vi.mock("./useCommands", () => ({
  useCommands: () => mocks.commandHandlers,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function HookHarness() {
  useShortcuts();
  return null;
}

describe("useShortcuts", () => {
  beforeEach(() => {
    mocks.getShortcutDefinitions.mockReset();
    mocks.getShortcutDefinitions.mockReturnValue([
      {
        id: "open-keybindings",
        descriptionKey: "keybindingOpenKeybindings",
        scope: "global",
        keys: "ctrl+/,command+/",
        run: vi.fn(),
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers centralized keydown listener and runs matching shortcut", () => {
    const run = vi.fn();
    mocks.getShortcutDefinitions.mockReturnValue([
      {
        id: "open-keybindings",
        descriptionKey: "keybindingOpenKeybindings",
        scope: "global",
        keys: "ctrl+/,command+/",
        run,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <HookHarness />
      </MemoryRouter>,
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", metaKey: true }));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("uses latest route/store context in keydown handler", () => {
    const run = vi.fn();
    mocks.getShortcutDefinitions.mockReturnValue([
      {
        id: "open-keybindings",
        descriptionKey: "keybindingOpenKeybindings",
        scope: "global",
        keys: "ctrl+/,command+/",
        run,
      },
    ]);

    const { rerender } = render(
      <MemoryRouter initialEntries={["/"]}>
        <HookHarness />
      </MemoryRouter>,
    );

    mocks.workspaceStoreState.selectedWorkspaceId = "workspace-2";
    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <HookHarness />
      </MemoryRouter>,
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", metaKey: true }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        workspaceStoreState: expect.objectContaining({
          selectedWorkspaceId: "workspace-2",
        }),
      }),
    );
  });

  it("cleans up keydown listener on unmount", () => {
    const run = vi.fn();
    mocks.getShortcutDefinitions.mockReturnValue([
      {
        id: "open-keybindings",
        descriptionKey: "keybindingOpenKeybindings",
        scope: "global",
        keys: "ctrl+/,command+/",
        run,
      },
    ]);

    const { unmount } = render(
      <MemoryRouter initialEntries={["/"]}>
        <HookHarness />
      </MemoryRouter>,
    );

    unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", metaKey: true }));

    expect(run).not.toHaveBeenCalled();
  });
});
