// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import type { AgentMessage } from "../chat/agentChatTypes";
import { agentChatStore } from "./agentChatStore";

const initialAgentChatStoreState = agentChatStore.getState();
const MAX_PER_TAB_AGGREGATE_UTF8_BYTES = 8 * 1024 * 1024; // 8 MiB

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function largeText(sizeBytes: number): string {
  const pattern = "Data line with varied content for realistic memory profiling. ";
  const chars: string[] = [];
  while (chars.join("").length < sizeBytes) {
    chars.push(pattern);
  }
  return chars.join("").slice(0, sizeBytes);
}

function makeMessage(id: string, contentSize?: number): AgentMessage {
  return {
    id,
    role: "assistant",
    content: contentSize ? [{ type: "text", text: largeText(contentSize) }] : [{ type: "text", text: `Message ${id}` }],
  };
}

// ─── Gap A: aggregate budget enforcement on appendMessage and finalizeStreamingMessage ─

describe("aggregate byte budget enforcement", () => {
  it("appendMessage evicts oldest messages when aggregate exceeds 8 MiB", { timeout: 60_000 }, () => {
    const tabId = "tab-append-aggregate";
    agentChatStore.getState().initSession(tabId, "session-append-aggregate");

    const MSG_BYTE_SIZE = 200 * 1024; // 200 KiB per message
    // 50 × 200 KiB = 10 MiB — exceeds 8 MiB aggregate budget
    const TOTAL = 50;

    for (let i = 1; i <= TOTAL; i++) {
      agentChatStore.getState().appendMessage(tabId, makeMessage(`agg-${i}`, MSG_BYTE_SIZE));
    }

    const stored = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];

    // Byte budget should trim messages; total bytes must be ≤ 8 MiB.
    const encoder = new TextEncoder();
    let totalBytes = 0;
    for (const msg of stored) {
      if (Array.isArray(msg.content) && msg.content[0]?.type === "text") {
        totalBytes += encoder.encode(msg.content[0].text).byteLength;
      }
    }
    expect(totalBytes).toBeLessThanOrEqual(MAX_PER_TAB_AGGREGATE_UTF8_BYTES);

    // Oldest messages should be evicted; newest retained.
    const lastId = stored[stored.length - 1]?.id;
    expect(lastId).toBe(`agg-${TOTAL}`);

    // At least some messages were dropped.
    expect(stored.length).toBeLessThan(TOTAL);
  });

  it(
    "finalizeStreamingMessage evicts oldest when streaming message pushes aggregate over 8 MiB",
    { timeout: 60_000 },
    () => {
      const tabId = "tab-finalize-aggregate";
      agentChatStore.getState().initSession(tabId, "session-finalize-aggregate");

      const MSG_BYTE_SIZE = 200 * 1024; // 200 KiB per message
      const FILL = 40; // 40 × 200 KiB = 8 MiB — right at the budget

      for (let i = 1; i <= FILL; i++) {
        agentChatStore.getState().appendMessage(tabId, makeMessage(`pre-${i}`, MSG_BYTE_SIZE));
      }

      // Set a large streaming message that would push the aggregate over budget.
      agentChatStore.getState().updateStreamingMessage(tabId, {
        id: "streaming-large",
        role: "assistant",
        content: [{ type: "text", text: largeText(MSG_BYTE_SIZE) }],
      });

      // Finalize — this pushes the streaming message into the transcript.
      agentChatStore.getState().finalizeStreamingMessage(tabId);

      const stored = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];

      // Streaming message is retained as the newest entry.
      expect(stored[stored.length - 1]?.id).toBe("streaming-large");

      // Aggregate byte budget is respected.
      const encoder = new TextEncoder();
      let totalBytes = 0;
      for (const msg of stored) {
        if (Array.isArray(msg.content) && msg.content[0]?.type === "text") {
          totalBytes += encoder.encode(msg.content[0].text).byteLength;
        }
      }
      expect(totalBytes).toBeLessThanOrEqual(MAX_PER_TAB_AGGREGATE_UTF8_BYTES);

      // Some pre-filled messages were evicted to make room.
      expect(stored.length).toBeLessThan(FILL + 1);
    },
  );
});

function makeCompletedChildLifecycle(childSessionId: string, input: number): AgentMessage {
  return {
    id: `completed-${childSessionId}`,
    role: "custom",
    customType: "pi-subagent-child",
    content: "",
    details: {
      event: "completed",
      agentId: "agent",
      agentName: "Agent",
      childSessionId,
      usage: { input, output: 0, cacheRead: 0, cacheWrite: 0, cost: input / 100 },
    },
  };
}

function makeBilledAssistant(id: string, input: number, totalTokens = input): AgentMessage {
  return {
    ...makeMessage(id),
    usage: { input, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens, cost: { total: input / 100 } },
  };
}

describe("usage ledger retention", () => {
  it("retains count-evicted parent and child usage without using totalTokens", () => {
    const tabId = "tab-ledger-count";
    agentChatStore.getState().initSession(tabId, "session-ledger-count");
    agentChatStore
      .getState()
      .replaceMessages(tabId, [
        makeBilledAssistant("evicted-parent", 3, 999),
        makeCompletedChildLifecycle("evicted-child", 5),
        ...Array.from({ length: 1000 }, (_, index) => makeMessage(`new-${index}`)),
      ]);

    const session = agentChatStore.getState().sessionsByTabId[tabId];
    expect(session?.messages.some((message) => message.id === "evicted-parent")).toBe(false);
    expect(session?.messages.some((message) => message.id === "completed-evicted-child")).toBe(false);
    expect(session?.usageLedger).toMatchObject({
      fallbackParentTotal: { input: 3, cost: 0.03 },
      childUsageBySessionId: { "evicted-child": { input: 5, cost: 0.05 } },
    });
  });

  it("retains byte-evicted lifecycle usage and does not double bill duplicate history", { timeout: 60_000 }, () => {
    const tabId = "tab-ledger-bytes";
    agentChatStore.getState().initSession(tabId, "session-ledger-bytes");
    const largeMessages = Array.from({ length: 42 }, (_, index) => makeMessage(`large-${index}`, 200 * 1024));
    const history = [
      makeBilledAssistant("evicted-parent", 3),
      makeCompletedChildLifecycle("evicted-child", 5),
      ...largeMessages,
    ];

    agentChatStore.getState().replaceMessages(tabId, history);
    agentChatStore.getState().replaceMessages(tabId, history);

    const session = agentChatStore.getState().sessionsByTabId[tabId];
    expect(session?.messages.some((message) => message.id === "completed-evicted-child")).toBe(false);
    expect(session?.usageLedger).toMatchObject({
      fallbackParentTotal: { input: 3, cost: 0.03 },
      childUsageBySessionId: { "evicted-child": { input: 5, cost: 0.05 } },
    });
  });

  it("merges a stale history reply without clearing active streaming state", () => {
    const tabId = "tab-ledger-stale-history";
    agentChatStore.getState().initSession(tabId, "session-ledger-stale-history");
    const streaming = makeMessage("live-assistant");
    agentChatStore.getState().setTurnActive(tabId, true);
    agentChatStore.getState().setActiveCoreTurnAssistantId(tabId, streaming.id);
    agentChatStore.getState().updateStreamingMessage(tabId, streaming);
    agentChatStore.getState().appendMessage(tabId, makeMessage("committed-parent"));

    agentChatStore.getState().replaceMessages(tabId, [makeBilledAssistant("stale-parent", 3)]);

    const session = agentChatStore.getState().sessionsByTabId[tabId];
    expect(session?.messages.map((message) => message.id)).toEqual(["stale-parent", "committed-parent"]);
    expect(session?.streamingMessage?.id).toBe("live-assistant");
    expect(session?.activeCoreTurnAssistantId).toBe("live-assistant");
    expect(session?.usageLedger.fallbackParentTotal).toMatchObject({ input: 3, cost: 0.03 });
  });

  it("preserves prompt-created streaming state when history arrives before turn_start", () => {
    const tabId = "tab-ledger-prompt-history-before-turn-start";
    agentChatStore.getState().initSession(tabId, "session-ledger-prompt-history-before-turn-start");
    const streaming = makeMessage("prompt-created-assistant");
    agentChatStore.getState().updateStreamingMessage(tabId, streaming);
    agentChatStore.getState().setActiveCoreTurnAssistantId(tabId, streaming.id);
    agentChatStore.getState().setSessionState(tabId, "running");

    agentChatStore.getState().replaceMessages(tabId, [makeBilledAssistant("stale-parent", 3)]);

    const session = agentChatStore.getState().sessionsByTabId[tabId];
    expect(session?.messages.map((message) => message.id)).toEqual(["stale-parent"]);
    expect(session?.streamingMessage).toEqual(streaming);
    expect(session?.activeCoreTurnAssistantId).toBe(streaming.id);
  });

  it("keeps the live assistant authoritative over stale same-ID partial history", () => {
    const tabId = "tab-ledger-stale-partial";
    agentChatStore.getState().initSession(tabId, "session-ledger-stale-partial");
    agentChatStore.getState().setTurnActive(tabId, true);
    const stalePartial = {
      ...makeBilledAssistant("same-assistant", 2, 20),
      content: [{ type: "text" as const, text: "stale" }],
    };
    const liveFinal = {
      ...makeBilledAssistant("same-assistant", 7, 70),
      content: [{ type: "text" as const, text: "authoritative final" }],
      startedAtMs: 1_000,
      durationMs: 2_000,
    };

    agentChatStore.getState().updateStreamingMessage(tabId, liveFinal);
    agentChatStore.getState().replaceMessages(tabId, [stalePartial]);

    const streamingSession = agentChatStore.getState().sessionsByTabId[tabId];
    expect(streamingSession?.messages).toEqual([]);
    expect(streamingSession?.streamingMessage).toEqual(liveFinal);

    agentChatStore.getState().finalizeStreamingMessage(tabId);

    const session = agentChatStore.getState().sessionsByTabId[tabId];
    expect(session?.messages).toEqual([liveFinal]);
    expect(session?.usageLedger.fallbackParentTotal).toMatchObject({ input: 7, cost: 0.07 });
  });

  it("replaces a stale same-ID history placeholder with the finalized active streaming message", () => {
    const tabId = "tab-ledger-stale-placeholder";
    agentChatStore.getState().initSession(tabId, "session-ledger-stale-placeholder");
    agentChatStore.getState().setTurnActive(tabId, true);
    const finalized = {
      ...makeBilledAssistant("same-assistant", 3),
      content: [{ type: "text" as const, text: "Final response" }],
      startedAtMs: 1_000,
      durationMs: 2_000,
    };
    agentChatStore.getState().updateStreamingMessage(tabId, finalized);

    agentChatStore.getState().replaceMessages(tabId, [{ id: finalized.id, role: "assistant", content: [] }]);
    agentChatStore.getState().finalizeStreamingMessage(tabId);

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.messages).toEqual([finalized]);
  });

  it("keeps renderer-final assistant and result when stale history arrives after settlement", () => {
    const tabId = "tab-ledger-settled-stale-history";
    agentChatStore.getState().initSession(tabId, "session-ledger-settled-stale-history");
    const finalMessage: AgentMessage = {
      ...makeBilledAssistant("live-final", 7, 700),
      content: [{ type: "toolCall", id: "tool-call-1", name: "Read", arguments: {} }],
    };
    const liveResult: AgentMessage = {
      id: "live-result",
      role: "toolResult",
      toolCallId: "tool-call-1",
      toolName: "Read",
      content: "renderer result",
    };

    agentChatStore.getState().updateStreamingMessage(tabId, finalMessage);
    agentChatStore.getState().finalizeStreamingMessage(tabId);
    agentChatStore.getState().appendMessage(tabId, liveResult);
    agentChatStore
      .getState()
      .replaceMessages(tabId, [
        { id: "live-final", role: "assistant", content: [{ type: "text", text: "stale history" }] },
      ]);

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.messages).toEqual([finalMessage, liveResult]);
  });

  it("compacts renderer-final IDs at a stats boundary while retaining post-boundary replay protection", () => {
    const tabId = "tab-ledger-renderer-final-compaction";
    agentChatStore.getState().initSession(tabId, "session-ledger-renderer-final-compaction");
    agentChatStore.getState().updateStreamingMessage(tabId, makeBilledAssistant("before-request", 3));
    agentChatStore.getState().finalizeStreamingMessage(tabId);
    agentChatStore.getState().recordSessionStatsRequest(tabId, "stats-request");
    const afterRequest = makeBilledAssistant("after-request", 7);
    agentChatStore.getState().updateStreamingMessage(tabId, afterRequest);
    agentChatStore.getState().finalizeStreamingMessage(tabId);

    agentChatStore
      .getState()
      .setSessionStats(
        tabId,
        { tokens: { input: 20, output: 0, cacheRead: 0, cacheWrite: 0, total: 20 }, cost: 0.2 },
        "stats-request",
      );

    const session = agentChatStore.getState().sessionsByTabId[tabId];
    expect(session?.rendererFinalAssistantIds).toEqual({ "after-request": true });
    agentChatStore
      .getState()
      .replaceMessages(tabId, [{ id: afterRequest.id, role: "assistant", content: [{ type: "text", text: "stale" }] }]);
    expect(agentChatStore.getState().sessionsByTabId[tabId]?.messages).toContainEqual(afterRequest);
  });

  it("accepts a settled baseline that includes live final usage before initial history", () => {
    const tabId = "tab-ledger-stats-live-history";
    agentChatStore.getState().initSession(tabId, "session-ledger-stats-live-history");
    agentChatStore.getState().setSessionStats(tabId, {
      tokens: { input: 20, output: 0, cacheRead: 0, cacheWrite: 0, total: 999 },
      cost: 0.2,
    });
    agentChatStore.getState().updateStreamingMessage(tabId, makeBilledAssistant("live-parent", 3));
    agentChatStore.getState().finalizeStreamingMessage(tabId);
    agentChatStore.getState().replaceMessages(tabId, [makeBilledAssistant("historical-parent", 7)]);

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.usageLedger).toMatchObject({
      parentBaseline: { input: 20, cost: 0.2 },
      parentPostBaselineDeltas: {},
    });
  });

  it("bills each finalized assistant once and upserts duplicate child lifecycle delivery", () => {
    const tabId = "tab-ledger-live";
    agentChatStore.getState().initSession(tabId, "session-ledger-live");
    agentChatStore.getState().replaceMessages(tabId, []);
    agentChatStore.getState().setSessionStats(tabId, {
      tokens: { input: 20, output: 0, cacheRead: 0, cacheWrite: 0, total: 999 },
      cost: 0.2,
    });
    const finalized = makeBilledAssistant("finalized-parent", 3);
    agentChatStore.getState().updateStreamingMessage(tabId, finalized);
    agentChatStore.getState().finalizeStreamingMessage(tabId);
    agentChatStore.getState().updateStreamingMessage(tabId, finalized);
    agentChatStore.getState().finalizeStreamingMessage(tabId);
    agentChatStore.getState().appendMessage(tabId, makeCompletedChildLifecycle("child-live", 5));
    agentChatStore.getState().appendMessage(tabId, makeCompletedChildLifecycle("child-live", 8));

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.usageLedger).toMatchObject({
      parentPostBaselineDeltas: { "finalized-parent": { input: 3, cost: 0.03 } },
      childUsageBySessionId: { "child-live": { input: 8, cost: 0.08 } },
    });
  });
});
