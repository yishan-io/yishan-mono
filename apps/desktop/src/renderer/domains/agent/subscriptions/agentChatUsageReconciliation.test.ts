// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAgentChatUsageSummary } from "../chat/agentChatUsageSummary";
import { flushAgentChatStreamBuffer } from "../runtime/agentChatStreamBuffer";
import { agentChatStore } from "../state/agentChatStore";
import { getAgentChatUsageLedgerTotal } from "../state/agentChatUsageLedger";
import { handleAgentPiEvent } from "./agentChatPiEventHandler";
import {
  clearAgentChatSessionStatsSequence,
  handlePiResponse,
  refreshAgentSessionStats,
} from "./agentChatPiEventShared";

const mocks = vi.hoisted(() => ({ sendPiCompatibilityCommand: vi.fn() }));
const initialAgentChatStoreState = agentChatStore.getState();

vi.mock("../daemon/daemonAgentProcedures", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => () => {}),
  sendPiCompatibilityCommand: mocks.sendPiCompatibilityCommand,
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  clearAgentChatSessionStatsSequence("session-usage");
  vi.clearAllMocks();
});

const tabId = "tab-usage";
const sessionId = "session-usage";
const parentStats = {
  tokens: { input: 100, output: 20, cacheRead: 30, cacheWrite: 40, total: 9_999 },
  cost: 1,
  contextUsage: { tokens: 500, contextWindow: 1_000, percent: 50 },
};

function deliverHistory(): void {
  handlePiResponse(tabId, sessionId, {
    command: "get_messages",
    success: true,
    data: {
      messages: [
        {
          id: "historical-parent",
          role: "assistant",
          content: [{ type: "text", text: "history" }],
          usage: { input: 5, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 500, cost: { total: 0.05 } },
        },
      ],
    },
  });
}

async function deliverCorrelatedStats(): Promise<void> {
  await refreshAgentSessionStats(sessionId);
  handlePiResponse(tabId, sessionId, {
    id: "agent-chat-stats-1",
    command: "get_session_stats",
    success: true,
    data: parentStats,
  });
}

function deliverCompletedChild(): void {
  handleAgentPiEvent({
    tabId,
    sessionId,
    workspaceId: "workspace",
    event: {
      type: "message_end",
      message: {
        id: "child-completed",
        role: "custom",
        customType: "pi-subagent-child",
        content: "",
        details: {
          event: "completed",
          agentId: "child",
          agentName: "Child",
          childSessionId: "child-session",
          usage: { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, cost: 0.05 },
        },
      },
    },
  });
}

describe("agent-chat usage reconciliation", () => {
  it.each(["history-first", "stats-first"])(
    "reconciles correlated idle parent stats when %s responses arrive",
    async (responseOrder) => {
      agentChatStore.getState().initSession(tabId, sessionId);

      if (responseOrder === "history-first") {
        deliverHistory();
        await deliverCorrelatedStats();
      } else {
        await deliverCorrelatedStats();
        deliverHistory();
      }

      const session = agentChatStore.getState().sessionsByTabId[tabId];
      expect(session?.sessionStats).toEqual(parentStats);
      expect(session?.usageLedger.parentBaseline).toEqual({
        input: 100,
        output: 20,
        cacheRead: 30,
        cacheWrite: 40,
        cost: 1,
      });
      expect(session?.usageLedger.fallbackParentTotal).toEqual({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
      });
      deliverCompletedChild();
      deliverCompletedChild();

      const ledger = agentChatStore.getState().sessionsByTabId[tabId]?.usageLedger;
      expect(ledger?.childUsageBySessionId).toEqual({
        "child-session": { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, cost: 0.05 },
      });
      expect(ledger && getAgentChatUsageLedgerTotal(ledger)).toEqual({
        input: 102,
        output: 23,
        cacheRead: 34,
        cacheWrite: 45,
        cost: 1.05,
      });
    },
  );

  it.each(["final-before-stats-response", "final-after-stats-response"])(
    "retains only parent finals after the correlated stats request when %s",
    async (deliveryOrder) => {
      agentChatStore.getState().initSession(tabId, sessionId);
      await refreshAgentSessionStats(sessionId);
      const deliverFinal = () => {
        handleAgentPiEvent({
          tabId,
          sessionId,
          workspaceId: "workspace",
          event: {
            type: "message_end",
            message: {
              id: "live-after-request",
              role: "assistant",
              content: [{ type: "text", text: "final" }],
              usage: { input: 7, output: 8, cacheRead: 9, cacheWrite: 10, totalTokens: 700, cost: { total: 0.07 } },
            },
          },
        });
      };
      if (deliveryOrder === "final-before-stats-response") deliverFinal();
      handlePiResponse(tabId, sessionId, {
        id: "agent-chat-stats-1",
        command: "get_session_stats",
        success: true,
        data: parentStats,
      });
      if (deliveryOrder === "final-after-stats-response") deliverFinal();

      const ledger = agentChatStore.getState().sessionsByTabId[tabId]?.usageLedger;
      expect(ledger && getAgentChatUsageLedgerTotal(ledger)).toEqual({
        input: 107,
        output: 28,
        cacheRead: 39,
        cacheWrite: 50,
        cost: 1.07,
      });
    },
  );

  it("gives a live same-ID stream precedence over stale partial history", () => {
    agentChatStore.getState().initSession(tabId, sessionId);
    handleAgentPiEvent({ tabId, sessionId, workspaceId: "workspace", event: { type: "turn_start" } });
    handlePiResponse(tabId, sessionId, {
      command: "get_messages",
      success: true,
      data: {
        messages: [
          {
            id: "same-parent",
            role: "assistant",
            content: [{ type: "text", text: "stale history" }],
            usage: { input: 2, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 200, cost: { total: 0.02 } },
          },
        ],
      },
    });

    handleAgentPiEvent({
      tabId,
      sessionId,
      workspaceId: "workspace",
      event: { type: "message_start", message: { id: "same-parent", role: "assistant", content: [] } },
    });
    handleAgentPiEvent({
      tabId,
      sessionId,
      workspaceId: "workspace",
      event: {
        type: "message_update",
        message: { id: "same-parent", role: "assistant", content: [{ type: "text", text: "x".repeat(160) }] },
      },
    });
    flushAgentChatStreamBuffer(tabId);

    const streamingSession = agentChatStore.getState().sessionsByTabId[tabId];
    const messagesForUsage = [...(streamingSession?.messages ?? []), streamingSession?.streamingMessage].filter(
      (message): message is NonNullable<typeof message> => Boolean(message),
    );
    expect(streamingSession?.messages).toEqual([]);
    expect(
      buildAgentChatUsageSummary(messagesForUsage, {
        id: "model",
        name: "Model",
        provider: "provider",
        contextWindow: 1_000,
      }),
    ).toMatchObject({ contextTokens: 40, inputTokens: 0 });

    handleAgentPiEvent({
      tabId,
      sessionId,
      workspaceId: "workspace",
      event: {
        type: "message_end",
        message: {
          id: "same-parent",
          role: "assistant",
          content: [{ type: "text", text: "authoritative final" }],
          usage: { input: 7, output: 8, cacheRead: 9, cacheWrite: 10, totalTokens: 300, cost: { total: 0.07 } },
        },
      },
    });

    const finalizedSession = agentChatStore.getState().sessionsByTabId[tabId];
    expect(finalizedSession?.messages).toMatchObject([
      { id: "same-parent", content: [{ type: "text", text: "authoritative final" }] },
    ]);
    expect(finalizedSession?.messages).toHaveLength(1);
    expect(
      buildAgentChatUsageSummary(finalizedSession?.messages ?? [], {
        id: "model",
        name: "Model",
        provider: "provider",
        contextWindow: 1_000,
      }),
    ).toMatchObject({ contextTokens: 300, inputTokens: 7 });
    expect(finalizedSession && getAgentChatUsageLedgerTotal(finalizedSession.usageLedger)).toEqual({
      input: 7,
      output: 8,
      cacheRead: 9,
      cacheWrite: 10,
      cost: 0.07,
    });
  });

  it("keeps live context through stale history and settles exact-once parent and child billing", async () => {
    agentChatStore.getState().initSession(tabId, sessionId);
    deliverHistory();
    await deliverCorrelatedStats();

    deliverCompletedChild();
    handleAgentPiEvent({ tabId, sessionId, workspaceId: "workspace", event: { type: "agent_start" } });
    handleAgentPiEvent({ tabId, sessionId, workspaceId: "workspace", event: { type: "turn_start" } });
    handlePiResponse(tabId, sessionId, {
      id: "agent-chat-stats-3",
      command: "get_session_stats",
      success: true,
      data: parentStats,
    });
    expect(agentChatStore.getState().sessionsByTabId[tabId]?.sessionStats).toBeNull();
    handleAgentPiEvent({
      tabId,
      sessionId,
      workspaceId: "workspace",
      event: { type: "message_start", message: { id: "next-parent", role: "assistant", content: [] } },
    });
    handleAgentPiEvent({
      tabId,
      sessionId,
      workspaceId: "workspace",
      event: {
        type: "message_update",
        message: { id: "next-parent", role: "assistant", content: [{ type: "text", text: "x".repeat(160) }] },
      },
    });

    flushAgentChatStreamBuffer(tabId);
    deliverHistory();
    const streamingSession = agentChatStore.getState().sessionsByTabId[tabId];
    expect(streamingSession?.streamingMessage?.id).toBe("next-parent");
    expect(
      buildAgentChatUsageSummary(
        [...(streamingSession?.messages ?? []), streamingSession?.streamingMessage].filter(
          (message): message is NonNullable<typeof message> => Boolean(message),
        ),
        { id: "model", name: "Model", provider: "provider", contextWindow: 1_000 },
      )?.contextTokens,
    ).toBe(540);

    handleAgentPiEvent({
      tabId,
      sessionId,
      workspaceId: "workspace",
      event: {
        type: "message_end",
        message: {
          id: "next-parent",
          role: "assistant",
          content: [{ type: "text", text: "complete" }],
          usage: { input: 7, output: 8, cacheRead: 9, cacheWrite: 10, totalTokens: 1, cost: { total: 0.07 } },
        },
      },
    });
    handleAgentPiEvent({ tabId, sessionId, workspaceId: "workspace", event: { type: "turn_end" } });
    handleAgentPiEvent({ tabId, sessionId, workspaceId: "workspace", event: { type: "agent_settled" } });

    handlePiResponse(tabId, sessionId, {
      id: "agent-chat-stats-4",
      command: "get_session_stats",
      success: true,
      data: {
        ...parentStats,
        tokens: { ...parentStats.tokens, input: 107, output: 28, cacheRead: 39, cacheWrite: 50 },
        cost: 1.07,
      },
    });

    const settledLedger = agentChatStore.getState().sessionsByTabId[tabId]?.usageLedger;
    expect(settledLedger).toMatchObject({
      parentBaseline: { input: 107, output: 28, cacheRead: 39, cacheWrite: 50, cost: 1.07 },
      parentPostBaselineDeltas: {},
      childUsageBySessionId: { "child-session": { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, cost: 0.05 } },
    });
    expect(settledLedger && getAgentChatUsageLedgerTotal(settledLedger)).toEqual({
      input: 109,
      output: 31,
      cacheRead: 43,
      cacheWrite: 55,
      cost: 1.12,
    });
  });
});
