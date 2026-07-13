import { describe, expect, it, vi } from "vitest";
import type { TabStoreState } from "../../store/tabStore";
import type { WorkspaceStoreState } from "../../store/types";
import { AgentChatRecoveryCoordinator } from "./agentChatRecovery";

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

function createTabStoreAccess(input: {
  tabs: TabStoreState["tabs"];
  selectedTabId?: string;
  selectedTabIdByWorkspaceId?: Record<string, string>;
}) {
  let state = {
    tabs: input.tabs,
    selectedTabId: input.selectedTabId ?? "",
    selectedTabIdByWorkspaceId: input.selectedTabIdByWorkspaceId ?? {},
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

describe("AgentChatRecoveryCoordinator", () => {
  it("persists only live agent-chat tabs", () => {
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
          id: "agent-tab-1",
          workspaceId: "workspace-1",
          title: "Draft chat",
          pinned: false,
          kind: "agent-chat",
          data: {
            cwd: "/tmp/workspace-1",
          },
        },
        {
          id: "agent-tab-2",
          workspaceId: "workspace-1",
          title: "Recovered chat",
          pinned: true,
          kind: "agent-chat",
          data: {
            cwd: "/tmp/workspace-1",
            sessionId: "live-session-2",
            userRenamed: true,
          },
        },
      ],
      selectedTabId: "agent-tab-2",
      selectedTabIdByWorkspaceId: {
        "workspace-1": "agent-tab-2",
      },
    });
    const coordinator = new AgentChatRecoveryCoordinator(
      tabStoreAccess as never,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1") as never,
      storage,
    );
    const unsubscribe = coordinator.startPersistingAgentChatTabs();

    tabStoreAccess.setState((state: TabStoreState) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === "agent-tab-2" && tab.kind === "agent-chat" ? { ...tab, title: "Recovered chat renamed" } : tab,
      ),
    }));
    tabStoreAccess.emit();

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    const raw = storage.getItem("yishan-agent-chat-recovery-v1");
    expect(raw).not.toBeNull();
    if (!raw) return;

    const parsed = JSON.parse(raw);
    expect(parsed.tabs).toHaveLength(1);
    expect(parsed.tabs[0]).toMatchObject({
      tabId: "agent-tab-2",
      sessionId: "live-session-2",
      title: "Recovered chat renamed",
      pinned: true,
      userRenamed: true,
    });

    unsubscribe();
  });

  it("restores agent-chat tabs from active daemon sessions", async () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "yishan-agent-chat-recovery-v1",
      JSON.stringify({
        selectedTabId: "agent-tab-1",
        tabs: [
          {
            tabId: "agent-tab-1",
            workspaceId: "workspace-1",
            title: "Recovered title",
            pinned: true,
            cwd: "/tmp/workspace-1",
            sessionId: "live-session-1",
            userRenamed: true,
          },
        ],
      }),
    );

    const tabStoreAccess = createTabStoreAccess({
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });
    const coordinator = new AgentChatRecoveryCoordinator(
      tabStoreAccess as never,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1") as never,
      storage,
    );

    const recoveryResult = await coordinator.restoreAgentChatTabsFromDaemon({
      listActivePiSessions: vi.fn().mockResolvedValue([
        {
          sessionId: "live-session-1",
          tabId: "agent-tab-1",
          workspaceId: "workspace-1",
          cwd: "/tmp/workspace-1",
        },
      ]),
    });

    expect(recoveryResult.selectedWorkspaceId).toBe("workspace-1");
    expect(tabStoreAccess.getState().tabs).toMatchObject([
      {
        id: "agent-tab-1",
        workspaceId: "workspace-1",
        title: "Recovered title",
        pinned: true,
        kind: "agent-chat",
        data: {
          cwd: "/tmp/workspace-1",
          sessionId: "live-session-1",
          userRenamed: true,
        },
      },
    ]);
    expect(tabStoreAccess.getState().selectedTabId).toBe("agent-tab-1");
  });

  it("returns a fallback workspace when restoring agent tabs without a persisted selected tab", async () => {
    const tabStoreAccess = createTabStoreAccess({
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });
    const coordinator = new AgentChatRecoveryCoordinator(
      tabStoreAccess as never,
      createWorkspaceStoreAccess("workspace-2", "/tmp/workspace-2") as never,
      createMemoryStorage(),
    );

    const recoveryResult = await coordinator.restoreAgentChatTabsFromDaemon({
      listActivePiSessions: vi.fn().mockResolvedValue([
        {
          sessionId: "live-session-2",
          tabId: "agent-tab-2",
          workspaceId: "workspace-2",
          cwd: "/tmp/workspace-2",
        },
      ]),
    });

    expect(recoveryResult.selectedWorkspaceId).toBeUndefined();
    expect(recoveryResult.fallbackWorkspaceId).toBe("workspace-2");
  });
});
