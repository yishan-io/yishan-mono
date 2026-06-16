import { describe, expect, it, vi } from "vitest";
import type { TabStoreState } from "../../../store/tabStore";
import type { WorkspaceStoreState } from "../../../store/types";
import { TerminalRecoveryCoordinator } from "./terminalRecovery";

/** Builds an in-memory Storage mock. */
function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

/** Creates a minimal mutable tab-store facade used by terminal recovery tests. */
function createTabStoreAccess(input: {
  tabs: TabStoreState["tabs"];
  selectedTabId?: string;
  selectedTabIdByWorkspaceId?: Record<string, string>;
}) {
  let state = {
    tabs: input.tabs,
    selectedTabId: input.selectedTabId ?? "",
    selectedTabIdByWorkspaceId: input.selectedTabIdByWorkspaceId ?? {},
    setTerminalTabSessionId: (tabId: string, sessionId: string) => {
      state.tabs = state.tabs.map((tab) =>
        tab.id === tabId && tab.kind === "terminal"
          ? {
              ...tab,
              data: {
                ...tab.data,
                sessionId,
              },
            }
          : tab,
      );
    },
  } as unknown as TabStoreState;

  const subscribers: Array<(nextState: TabStoreState) => void> = [];
  const subscribe = vi.fn((listener: (nextState: TabStoreState) => void) => {
    subscribers.push(listener);
    return () => {
      const index = subscribers.indexOf(listener);
      if (index >= 0) {
        subscribers.splice(index, 1);
      }
    };
  });

  return {
    getState: () => state,
    setState: (patch: unknown) => {
      const nextPatch = typeof patch === "function" ? patch(state) : patch;
      state = {
        ...state,
        ...(nextPatch as Partial<TabStoreState>),
      } as TabStoreState;
    },
    emit: () => {
      for (const subscriber of subscribers) {
        subscriber(state);
      }
    },
    subscribe,
  };
}

/** Creates a minimal workspace-store facade used by terminal recovery tests. */
function createWorkspaceStoreAccess(workspaceId: string, worktreePath: string) {
  const state = {
    selectedWorkspaceId: workspaceId,
    workspaces: [
      {
        id: workspaceId,
        repoId: "repo-1",
        name: "Workspace",
        title: "Workspace",
        sourceBranch: "origin/main",
        branch: "main",
        summaryId: "summary-1",
        worktreePath,
      },
    ],
  } as unknown as WorkspaceStoreState;

  return {
    getState: () => state,
  };
}

/** Creates a minimal workspace-store facade for multi-workspace daemon recovery tests. */
function createWorkspaceStoreAccessForWorkspaces(
  workspaces: Array<{ id: string; worktreePath: string }>,
  selectedWorkspaceId = workspaces[0]?.id ?? "",
) {
  const state = {
    selectedWorkspaceId,
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      repoId: `repo-${workspace.id}`,
      name: workspace.id,
      title: workspace.id,
      sourceBranch: "origin/main",
      branch: "main",
      summaryId: `summary-${workspace.id}`,
      worktreePath: workspace.worktreePath,
    })),
  } as unknown as WorkspaceStoreState;

  return {
    getState: () => state,
  };
}

describe("TerminalRecoveryCoordinator", () => {
  it("persists only when terminal recovery payload changes", () => {
    const storage = createMemoryStorage();
    const setItemSpy = vi.spyOn(storage, "setItem");
    const tabStoreAccess = createTabStoreAccess({
      tabs: [
        {
          id: "file-tab-1",
          workspaceId: "workspace-1",
          title: "README.md",
          pinned: false,
          kind: "file",
          data: {
            path: "README.md",
            content: "",
            savedContent: "",
            isDirty: false,
            isTemporary: false,
          },
        },
        {
          id: "terminal-tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: {
            title: "Terminal",
            sessionId: "session-1",
          },
        },
      ],
      selectedTabId: "terminal-tab-1",
      selectedTabIdByWorkspaceId: {
        "workspace-1": "terminal-tab-1",
      },
    });
    const coordinator = new TerminalRecoveryCoordinator(
      tabStoreAccess as never,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1") as never,
      storage,
    );
    const unsubscribe = coordinator.startPersistingTerminalTabs();

    tabStoreAccess.emit();
    expect(setItemSpy).toHaveBeenCalledTimes(0);

    tabStoreAccess.setState((state: TabStoreState) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === "file-tab-1" && tab.kind === "file"
          ? {
              ...tab,
              title: "README_NEW.md",
            }
          : tab,
      ),
    }));
    tabStoreAccess.emit();
    expect(setItemSpy).toHaveBeenCalledTimes(0);

    tabStoreAccess.setState((state: TabStoreState) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === "terminal-tab-1" && tab.kind === "terminal"
          ? {
              ...tab,
              data: {
                ...tab.data,
                sessionId: "session-2",
              },
            }
          : tab,
      ),
    }));
    tabStoreAccess.emit();
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    tabStoreAccess.emit();
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("restoreTerminalTabsFromDaemon creates tabs for active daemon sessions", async () => {
    const storage = createMemoryStorage();
    const tabStoreAccess = createTabStoreAccess({
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });
    const coordinator = new TerminalRecoveryCoordinator(
      tabStoreAccess as never,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1") as never,
      storage,
    );

    const listTerminalSessionsMock = vi.fn().mockResolvedValue([
      {
        sessionId: "term-1",
        workspaceId: "workspace-1",
        pid: 1234,
        status: "running",
        startedAt: "2026-06-16T00:00:00Z",
      },
    ]);

    const restoredWorkspaceId = await coordinator.restoreTerminalTabsFromDaemon({
      listTerminalSessions: listTerminalSessionsMock,
    });

    expect(restoredWorkspaceId).toBe("workspace-1");
    const tabs = tabStoreAccess.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      workspaceId: "workspace-1",
      kind: "terminal",
      data: { sessionId: "term-1", title: "Terminal" },
    });
  });

  it("restoreTerminalTabsFromDaemon skips sessions that already have tabs", async () => {
    const storage = createMemoryStorage();
    const tabStoreAccess = createTabStoreAccess({
      tabs: [
        {
          id: "existing-tab",
          workspaceId: "workspace-1",
          title: "My Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "My Terminal", sessionId: "term-1" },
        } as never,
      ],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });
    const coordinator = new TerminalRecoveryCoordinator(
      tabStoreAccess as never,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1") as never,
      storage,
    );

    const listTerminalSessionsMock = vi.fn().mockResolvedValue([
      {
        sessionId: "term-1",
        workspaceId: "workspace-1",
        pid: 1234,
        status: "running",
      },
    ]);

    const restoredWorkspaceId = await coordinator.restoreTerminalTabsFromDaemon({
      listTerminalSessions: listTerminalSessionsMock,
    });

    expect(restoredWorkspaceId).toBeUndefined();
    expect(tabStoreAccess.getState().tabs).toHaveLength(1);
  });

  it("restoreTerminalTabsFromDaemon merges with localStorage data for matching sessionId", async () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "yishan-terminal-recovery-v1",
      JSON.stringify({
        selectedTabId: "persisted-tab-1",
        tabs: [
          {
            tabId: "persisted-tab-1",
            workspaceId: "workspace-1",
            title: "My Saved Terminal",
            pinned: true,
            sessionId: "term-1",
            launchCommand: "echo hello",
          },
        ],
      }),
    );
    const tabStoreAccess = createTabStoreAccess({
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });

    const coordinator = new TerminalRecoveryCoordinator(
      tabStoreAccess as never,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1") as never,
      storage,
    );

    const listTerminalSessionsMock = vi.fn().mockResolvedValue([
      {
        sessionId: "term-1",
        workspaceId: "workspace-1",
        pid: 1234,
        status: "running",
      },
    ]);

    await coordinator.restoreTerminalTabsFromDaemon({
      listTerminalSessions: listTerminalSessionsMock,
    });

    const tabs = tabStoreAccess.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      id: "persisted-tab-1",
      workspaceId: "workspace-1",
      title: "My Saved Terminal",
      pinned: true,
      kind: "terminal",
      data: {
        sessionId: "term-1",
        launchCommand: "echo hello",
      },
    });
  });

  it("restoreTerminalTabsFromDaemon returns the restored workspace id for sessions outside the current workspace", async () => {
    const storage = createMemoryStorage();
    const tabStoreAccess = createTabStoreAccess({
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });
    const coordinator = new TerminalRecoveryCoordinator(
      tabStoreAccess as never,
      createWorkspaceStoreAccessForWorkspaces([
        { id: "workspace-1", worktreePath: "/tmp/workspace-1" },
        { id: "workspace-2", worktreePath: "/tmp/workspace-2" },
      ]) as never,
      storage,
    );

    const restoredWorkspaceId = await coordinator.restoreTerminalTabsFromDaemon({
      listTerminalSessions: vi.fn().mockResolvedValue([
        {
          sessionId: "term-2",
          workspaceId: "workspace-2",
          pid: 5678,
          status: "running",
        },
      ]),
    });

    expect(restoredWorkspaceId).toBe("workspace-2");
    expect(tabStoreAccess.getState().tabs).toHaveLength(1);
    expect(tabStoreAccess.getState().tabs[0]).toMatchObject({
      workspaceId: "workspace-2",
      kind: "terminal",
      data: { sessionId: "term-2" },
    });
  });

  it("restoreTerminalTabsFromDaemon handles errors gracefully", async () => {
    const storage = createMemoryStorage();
    const tabStoreAccess = createTabStoreAccess({
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });
    const coordinator = new TerminalRecoveryCoordinator(
      tabStoreAccess as never,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1") as never,
      storage,
    );

    const listTerminalSessionsMock = vi.fn().mockRejectedValue(new Error("daemon unavailable"));

    const restoredWorkspaceId = await coordinator.restoreTerminalTabsFromDaemon({
      listTerminalSessions: listTerminalSessionsMock,
    });

    expect(restoredWorkspaceId).toBeUndefined();
    expect(tabStoreAccess.getState().tabs).toHaveLength(0);
  });
});
