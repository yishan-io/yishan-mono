// @vitest-environment jsdom

import { AgentChatRecoveryCoordinator } from "@renderer/domains/agent/runtime/agentChatRecovery";
import { chatStore } from "@renderer/domains/agent/state/chatStore";
import { tabStore } from "@renderer/domains/workbench/state/tabStore";
import type { TabStoreState } from "@renderer/domains/workbench/state/tabStore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeTabWithCleanup } from "./tabCloseHandler";

const daemon = vi.hoisted(() => {
  const activeSessions = new Map<string, { sessionId: string; tabId: string; workspaceId: string; cwd: string }>();
  return {
    activeSessions,
    stopAgentSession: vi.fn(async (tabId: string) => {
      activeSessions.delete(tabId);
    }),
  };
});

vi.mock("@renderer/domains/agent/commands/agentChatCommands", () => ({
  stopAgentSession: daemon.stopAgentSession,
}));

const initialTabStoreState = tabStore.getState();
const initialChatStoreState = chatStore.getState();

afterEach(() => {
  daemon.activeSessions.clear();
  vi.clearAllMocks();
  tabStore.setState(initialTabStoreState, true);
  chatStore.setState(initialChatStoreState, true);
});

function createEmptyTabStoreAccess() {
  let state = { tabs: [], selectedTabId: "", selectedTabIdByWorkspaceId: {} } as unknown as TabStoreState;
  return {
    getState: () => state,
    setState: (patch: Partial<TabStoreState>) => {
      state = { ...state, ...patch };
    },
    subscribe: () => () => undefined,
  };
}

describe("tab close recovery", () => {
  it("does not restore an agent chat after close stops its daemon session", async () => {
    daemon.activeSessions.set("tab-1", {
      sessionId: "session-1",
      tabId: "tab-1",
      workspaceId: "workspace-1",
      cwd: "/tmp/workspace-1",
    });
    tabStore.setState({
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "Agent Chat",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/workspace-1", sessionId: "session-1" },
        },
      ],
    });

    closeTabWithCleanup("tab-1");
    await vi.waitFor(() => {
      expect(daemon.stopAgentSession).toHaveBeenCalledWith("tab-1");
    });

    const restoredTabStore = createEmptyTabStoreAccess();
    const coordinator = new AgentChatRecoveryCoordinator(
      restoredTabStore as never,
      { getState: () => ({ workspaces: [{ id: "workspace-1" }] }) },
      undefined,
    );
    await coordinator.restoreAgentChatTabsFromDaemon({
      listActivePiSessions: async () => Array.from(daemon.activeSessions.values()),
    });

    expect(restoredTabStore.getState().tabs).toEqual([]);
  });
});
