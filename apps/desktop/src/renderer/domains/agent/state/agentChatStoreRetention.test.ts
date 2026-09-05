// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAgentToolCallLifecycleStates } from "../chat/agentChatSubagents";
import type { AgentMessage } from "../chat/agentChatTypes";
import { agentChatStore } from "./agentChatStore";
import { selectRunningSubagents } from "./agentChatStoreSession";

const initialAgentChatStoreState = agentChatStore.getState();

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  vi.clearAllMocks();
});

const MAX_MESSAGES = 1000;
const MAX_PER_TAB_AGGREGATE_UTF8_BYTES = 8 * 1024 * 1024; // 8 MiB

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

function fillMessages(tabId: string, count: number, prefix = "fill"): void {
  for (let i = 1; i <= count; i++) {
    agentChatStore.getState().appendMessage(tabId, makeMessage(`${prefix}-${i}`));
  }
}

/** Seeds history in one O(n) pass; appendMessage is O(n) per call, so bulk loops are quadratic. */
function seedMessages(tabId: string, count: number, prefix = "fill"): void {
  agentChatStore.getState().replaceMessages(
    tabId,
    Array.from({ length: count }, (_, i) => makeMessage(`${prefix}-${i + 1}`)),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("agentChatStore", () => {
  it("sets DSH transcript retry availability and clears only the active stream", () => {
    const tabId = "tab-dsh-retry-and-clear";
    agentChatStore.getState().initSession(tabId, "session-dsh-retry-and-clear");
    agentChatStore.getState().appendMessage(tabId, makeMessage("committed"));
    agentChatStore.getState().updateStreamingMessage(tabId, makeMessage("streaming"));

    agentChatStore.getState().setDSHTranscriptRetryAvailable(tabId, true);
    agentChatStore.getState().clearStreamingMessage(tabId);

    const session = agentChatStore.getState().sessionsByTabId[tabId];
    expect(session?.dshTranscriptRetryAvailable).toBe(true);
    expect(session?.streamingMessage).toBeNull();
    expect(session?.messages.map((message) => message.id)).toEqual(["committed"]);
  });

  // ─── finalizeStreamingMessage DOES enforce MAX_MESSAGES_PER_TAB ─────────────

  describe("finalizeStreamingMessage cap enforcement", () => {
    it("enforces MAX_MESSAGES_PER_TAB when finalizing a streaming message", () => {
      const tabId = "tab-finalize-no-cap";
      agentChatStore.getState().initSession(tabId, "session-finalize-no-cap");

      // Fill messages to exactly MAX_MESSAGES in one pass.
      seedMessages(tabId, MAX_MESSAGES);
      expect(agentChatStore.getState().sessionsByTabId[tabId]?.messages).toHaveLength(MAX_MESSAGES);

      // Set a streaming message and finalize it.
      agentChatStore.getState().updateStreamingMessage(tabId, {
        id: "finalized-overflow",
        role: "assistant",
        content: [{ type: "text", text: "Overflow" }],
      });
      agentChatStore.getState().finalizeStreamingMessage(tabId);

      // Cap is now enforced: oldest message trimmed, newest retained.
      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("finalized-overflow");
    });

    it("deduplicates correctly and enforces the cap for new unique IDs", () => {
      const tabId = "tab-finalize-dedup";
      agentChatStore.getState().initSession(tabId, "session-finalize-dedup");

      seedMessages(tabId, MAX_MESSAGES);

      // First: finalize a message with a unique ID → cap enforced, oldest trimmed.
      agentChatStore.getState().updateStreamingMessage(tabId, {
        id: "unique-1",
        role: "assistant",
        content: [{ type: "text", text: "Unique 1" }],
      });
      agentChatStore.getState().finalizeStreamingMessage(tabId);

      let messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("unique-1");

      // Second: finalize a message whose ID already exists → deduplication still works.
      agentChatStore.getState().updateStreamingMessage(tabId, {
        id: "fill-1", // ID no longer in messages after trimming above, but let's test a duplicate
        role: "assistant",
        content: [{ type: "text", text: "Should be deduped" }],
      });
      // Attempt to finalize with an ID that IS currently in the messages array.
      // Re-add fill-1 to test dedup: replace with an ID that exists.
      const existingId = messages[0]?.id ?? "fill-2";
      agentChatStore.getState().updateStreamingMessage(tabId, {
        id: existingId,
        role: "assistant",
        content: [{ type: "text", text: "Should be deduped" }],
      });
      agentChatStore.getState().finalizeStreamingMessage(tabId);

      messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES); // dedup: no growth when ID already exists

      // Third: finalize another unique ID → cap still enforced.
      agentChatStore.getState().updateStreamingMessage(tabId, {
        id: "unique-2",
        role: "assistant",
        content: [{ type: "text", text: "Unique 2" }],
      });
      agentChatStore.getState().finalizeStreamingMessage(tabId);

      messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("unique-2");
    });
  });

  // ─── appendMessage DOES enforce MAX_MESSAGES_PER_TAB ───────────────────────

  describe("appendMessage cap enforcement", () => {
    it("trims oldest messages when exceeding MAX_MESSAGES_PER_TAB", () => {
      const tabId = "tab-append-cap";
      agentChatStore.getState().initSession(tabId, "session-append-cap");

      // Seed at the cap in one pass, then overflow with a small number of
      // appends (each append trims one oldest message).
      seedMessages(tabId, MAX_MESSAGES, "seed");
      fillMessages(tabId, 100);

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      // Oldest 100 trimmed: seed-1 through seed-100 are gone.
      expect(messages[0]?.id).toBe("seed-101");
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("fill-100");
    });

    it("does not trim when exactly at MAX_MESSAGES_PER_TAB", () => {
      const tabId = "tab-append-exact";
      agentChatStore.getState().initSession(tabId, "session-append-exact");

      // One append that reaches the cap exactly must not trim anything.
      seedMessages(tabId, MAX_MESSAGES - 1, "seed");
      fillMessages(tabId, 1);

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      expect(messages[0]?.id).toBe("seed-1");
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("fill-1");
    });

    it("deduplicates messages with the same ID (skips append)", () => {
      const tabId = "tab-append-dedup";
      agentChatStore.getState().initSession(tabId, "session-append-dedup");

      agentChatStore.getState().appendMessage(tabId, makeMessage("dup-1"));
      agentChatStore.getState().appendMessage(tabId, makeMessage("dup-1"));
      agentChatStore.getState().appendMessage(tabId, makeMessage("dup-2"));

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(2);
      expect(messages[0]?.id).toBe("dup-1");
      expect(messages[1]?.id).toBe("dup-2");
    });

    it("retains content within budget for a single message under the count cap", () => {
      const tabId = "tab-append-large";
      agentChatStore.getState().initSession(tabId, "session-append-large");

      // 100 KiB content added directly (no normalization at store level).
      // Per-message truncation is applied at the normalization boundary, not here.
      const contentSize = 100 * 1024; // 100 KiB
      agentChatStore.getState().appendMessage(tabId, makeMessage("large-msg", contentSize));

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(1);
      const content = messages[0]?.content;
      if (!Array.isArray(content)) throw new Error("expected array");
      if (content[0]?.type !== "text") throw new Error("expected text block");

      // Store does not truncate content — that's the normalization layer's job.
      expect(content[0].text.length).toBe(contentSize);
    });
  });

  // ─── replaceMessages DOES enforce MAX_MESSAGES_PER_TAB ─────────────────────

  describe("replaceMessages cap enforcement", () => {
    it("trims history messages to the newest MAX_MESSAGES_PER_TAB", () => {
      const tabId = "tab-replace-cap";
      agentChatStore.getState().initSession(tabId, "session-replace-cap");

      const historyMessages: AgentMessage[] = Array.from({ length: 1200 }, (_, i) => ({
        id: `history-msg-${i + 1}`,
        role: "assistant" as const,
        content: [{ type: "text" as const, text: `History line ${i + 1}` }],
      }));

      agentChatStore.getState().replaceMessages(tabId, historyMessages);

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      // Keeps newest 1000: history-msg-201 through history-msg-1200
      expect(messages[0]?.id).toBe("history-msg-201");
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("history-msg-1200");
    });

    it("keeps all messages when history is under the cap", () => {
      const tabId = "tab-replace-under";
      agentChatStore.getState().initSession(tabId, "session-replace-under");

      const historyMessages: AgentMessage[] = Array.from({ length: 10 }, (_, i) => ({
        id: `short-history-${i + 1}`,
        role: "assistant" as const,
        content: [{ type: "text" as const, text: `Entry ${i + 1}` }],
      }));

      agentChatStore.getState().replaceMessages(tabId, historyMessages);

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(10);
      expect(messages[0]?.id).toBe("short-history-1");
    });

    it("clears the streaming message after replace", () => {
      const tabId = "tab-replace-clears-streaming";
      agentChatStore.getState().initSession(tabId, "session-replace-clears-streaming");

      agentChatStore.getState().updateStreamingMessage(tabId, makeMessage("streaming"));
      expect(agentChatStore.getState().sessionsByTabId[tabId]?.streamingMessage).not.toBeNull();

      agentChatStore.getState().replaceMessages(tabId, []);
      expect(agentChatStore.getState().sessionsByTabId[tabId]?.streamingMessage).toBeNull();
    });

    it("retains a single oversized message via the always-keep-one rule", { timeout: 60_000 }, () => {
      const tabId = "tab-replace-oversized";
      agentChatStore.getState().initSession(tabId, "session-replace-oversized");

      const TWO_MIB = 2 * 1024 * 1024; // 2,097,152 bytes
      const hugeContent = largeText(TWO_MIB);

      const oversizedMessage: AgentMessage = {
        id: "oversized-single",
        role: "assistant",
        content: [{ type: "text", text: hugeContent }],
      };

      agentChatStore.getState().replaceMessages(tabId, [oversizedMessage]);

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(1);
      expect(messages[0]?.id).toBe("oversized-single");

      const content = messages[0]?.content;
      if (!Array.isArray(content)) throw new Error("expected array");
      if (content[0]?.type !== "text") throw new Error("expected text block");

      // A single oversized message is always retained (always-keep-one rule).
      // Per-message truncation is applied at the normalization layer, not in the store.
      expect(content[0].text.length).toBe(TWO_MIB);
    });

    it("trims messages to fit within MAX_PER_TAB_AGGREGATE_UTF8_BYTES (byte budget)", { timeout: 60_000 }, () => {
      const tabId = "tab-aggregate-budget";
      agentChatStore.getState().initSession(tabId, "session-aggregate-budget");

      const MSG_BYTE_SIZE = 20 * 1024; // 20 KiB per message
      // 600 messages × 20 KiB = 12 MiB total; the 1000-message count cap does
      // not trim, so the byte budget trims 12 MiB down to the 8 MiB limit.
      const TOTAL = 600;
      const messages: AgentMessage[] = Array.from({ length: TOTAL }, (_, i) => ({
        id: `budget-msg-${i + 1}`,
        role: "assistant" as const,
        content: [{ type: "text" as const, text: largeText(MSG_BYTE_SIZE) }],
      }));

      agentChatStore.getState().replaceMessages(tabId, messages);

      const stored = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];

      // The byte budget trims 12 MiB of content down to the 8 MiB limit (~409 kept).
      expect(stored.length).toBeLessThan(500);
      // Total bytes should fit within the aggregate budget.
      const encoder = new TextEncoder();
      let totalBytes = 0;
      for (const msg of stored) {
        if (Array.isArray(msg.content) && msg.content[0]?.type === "text") {
          totalBytes += encoder.encode(msg.content[0].text).byteLength;
        }
      }
      expect(totalBytes).toBeLessThanOrEqual(MAX_PER_TAB_AGGREGATE_UTF8_BYTES);

      // Newest messages should be kept.
      expect(stored[stored.length - 1]?.id).toBe("budget-msg-600");
    });
  });

  describe("active history retention", () => {
    it("retains an Agent result from the renderer once, in source order, and resolves its card", () => {
      const tabId = "tab-active-tool-result-history";
      agentChatStore.getState().initSession(tabId, "session-active-tool-result-history");

      const finalizedAssistant: AgentMessage = {
        id: "assistant-tool-call",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tool-call-1",
            name: "Agent",
            arguments: { agent: "researcher", prompt: "Inspect notes" },
          },
        ],
      };
      const toolResult: AgentMessage = {
        id: "tool-result-1",
        role: "toolResult",
        toolCallId: "tool-call-1",
        toolName: "Agent",
        content: "Agent completed",
      };

      agentChatStore.getState().updateStreamingMessage(tabId, finalizedAssistant);
      agentChatStore.getState().finalizeStreamingMessage(tabId);
      agentChatStore.getState().appendMessage(tabId, toolResult);
      agentChatStore.getState().setTurnActive(tabId, true);
      agentChatStore.getState().updateStreamingMessage(tabId, {
        id: "assistant-still-streaming",
        role: "assistant",
        content: [{ type: "text", text: "Continuing the response" }],
      });

      // The get_messages response was taken before the result arrived.
      agentChatStore
        .getState()
        .replaceMessages(tabId, [
          { ...finalizedAssistant, content: [{ type: "toolCall", id: "tool-call-1", name: "Agent", arguments: {} }] },
        ]);

      const session = agentChatStore.getState().sessionsByTabId[tabId];
      expect(session?.messages).toEqual([finalizedAssistant, toolResult]);
      expect(resolveAgentToolCallLifecycleStates(session?.messages ?? []).get("tool-call-1")).toBe("completed");
      expect(selectRunningSubagents(session)).toEqual([]);
    });

    it("keeps a finalized tool-call owner when returning history contains its result after stats reconciliation", () => {
      const tabId = "tab-history-after-overview";
      agentChatStore.getState().initSession(tabId, "session-history-after-overview");
      const finalizedAssistant: AgentMessage = {
        id: "assistant-tool-call",
        role: "assistant",
        content: [{ type: "toolCall", id: "tool-call-1", name: "Read", arguments: {} }],
      };
      const toolResult: AgentMessage = {
        id: "tool-result-1",
        role: "toolResult",
        toolCallId: "tool-call-1",
        toolName: "Read",
        content: "file contents",
      };

      agentChatStore.getState().appendMessage(tabId, finalizedAssistant);
      agentChatStore.getState().appendMessage(tabId, toolResult);
      agentChatStore.getState().setSessionStats(tabId, {
        tokens: { input: 20, output: 0, cacheRead: 0, cacheWrite: 0, total: 20 },
        cost: 0.2,
      });

      // Re-entering the workspace hydrates history. The snapshot can contain
      // the tool result before its assistant tool-call message.
      agentChatStore.getState().replaceMessages(tabId, [toolResult]);

      expect(agentChatStore.getState().sessionsByTabId[tabId]?.messages).toEqual([finalizedAssistant, toolResult]);
    });

    it("removes a transient retained result when count trimming evicts its assistant", () => {
      const tabId = "tab-retained-tool-result-count-cap";
      agentChatStore.getState().initSession(tabId, "session-retained-tool-result-count-cap");
      const finalizedAssistant: AgentMessage = {
        id: "assistant-tool-call",
        role: "assistant",
        content: [{ type: "toolCall", id: "tool-call-1", name: "Read", arguments: {} }],
      };
      const toolResult: AgentMessage = {
        id: "tool-result-1",
        role: "toolResult",
        toolCallId: "tool-call-1",
        toolName: "Read",
        content: "file contents",
      };

      agentChatStore.getState().appendMessage(tabId, finalizedAssistant);
      agentChatStore.getState().appendMessage(tabId, toolResult);
      agentChatStore
        .getState()
        .replaceMessages(tabId, [
          { ...finalizedAssistant, content: [] },
          ...Array.from({ length: MAX_MESSAGES }, (_, index) => makeMessage(`history-${index}`)),
        ]);

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages).toHaveLength(MAX_MESSAGES - 1);
      expect(messages.some((message) => message.id === finalizedAssistant.id)).toBe(false);
      expect(messages.some((message) => message.id === toolResult.id)).toBe(false);
    });
  });

  // ─── setSubagentLiveTranscripts caps children and aggregate bytes ──────────
});
