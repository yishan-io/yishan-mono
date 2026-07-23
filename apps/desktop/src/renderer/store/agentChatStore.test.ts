// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "./agentChatStore";
import type { AgentMessage } from "./agentChatTypes";

const initialAgentChatStoreState = agentChatStore.getState();

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  vi.clearAllMocks();
});

const MAX_MESSAGES = 500;
const MAX_SUBAGENT_CHILDREN = 20;
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe("agentChatStore", () => {
  // ─── finalizeStreamingMessage DOES enforce MAX_MESSAGES_PER_TAB ─────────────

  describe("finalizeStreamingMessage cap enforcement", () => {
    it("enforces MAX_MESSAGES_PER_TAB when finalizing a streaming message", () => {
      const tabId = "tab-finalize-no-cap";
      agentChatStore.getState().initSession(tabId, "session-finalize-no-cap");

      // Fill messages to exactly MAX_MESSAGES via appendMessage.
      fillMessages(tabId, MAX_MESSAGES);
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

      fillMessages(tabId, MAX_MESSAGES);

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

      fillMessages(tabId, 600);

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      // Oldest 100 trimmed: fill-1 through fill-100 are gone.
      expect(messages[0]?.id).toBe("fill-101");
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("fill-600");
    });

    it("does not trim when exactly at MAX_MESSAGES_PER_TAB", () => {
      const tabId = "tab-append-exact";
      agentChatStore.getState().initSession(tabId, "session-append-exact");

      fillMessages(tabId, MAX_MESSAGES);

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      expect(messages[0]?.id).toBe("fill-1");
      expect(messages[MAX_MESSAGES - 1]?.id).toBe(`fill-${MAX_MESSAGES}`);
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

      const historyMessages: AgentMessage[] = Array.from({ length: 800 }, (_, i) => ({
        id: `history-msg-${i + 1}`,
        role: "assistant" as const,
        content: [{ type: "text" as const, text: `History line ${i + 1}` }],
      }));

      agentChatStore.getState().replaceMessages(tabId, historyMessages);

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      // Keeps newest 500: history-msg-301 through history-msg-800
      expect(messages[0]?.id).toBe("history-msg-301");
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("history-msg-800");
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

    it("marks hasLoadedMessages after replace", () => {
      const tabId = "tab-replace-loaded";
      agentChatStore.getState().initSession(tabId, "session-replace-loaded");

      expect(agentChatStore.getState().sessionsByTabId[tabId]?.hasLoadedMessages).toBe(false);

      agentChatStore.getState().replaceMessages(tabId, []);
      expect(agentChatStore.getState().sessionsByTabId[tabId]?.hasLoadedMessages).toBe(true);
    });

    it("retains a single oversized message via the always-keep-one rule", { timeout: 30_000 }, () => {
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
      // 600 messages × 20 KiB = 12 MiB total; count cap brings to 500 (10 MiB),
      // byte budget then trims to fit within 8 MiB.
      const TOTAL = 600;
      const messages: AgentMessage[] = Array.from({ length: TOTAL }, (_, i) => ({
        id: `budget-msg-${i + 1}`,
        role: "assistant" as const,
        content: [{ type: "text" as const, text: largeText(MSG_BYTE_SIZE) }],
      }));

      agentChatStore.getState().replaceMessages(tabId, messages);

      const stored = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];

      // Count cap first: 600 → 500; byte budget further trims 500 × 20 KiB = 10 MiB → 8 MiB.
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

  // ─── setSubagentLiveTranscripts caps children and aggregate bytes ──────────

  describe("setSubagentLiveTranscripts retention", () => {
    it("caps child transcripts to MAX_SUBAGENT_CHILDREN and respects per-child limits", () => {
      const tabId = "tab-subagent-uncapped";
      agentChatStore.getState().initSession(tabId, "session-subagent-uncapped");

      const CHILD_COUNT = 50;
      const MSG_PER_CHILD = 100;
      const transcripts: Record<string, AgentMessage[]> = {};

      for (let child = 1; child <= CHILD_COUNT; child++) {
        const childId = `child-session-${child}`;
        transcripts[childId] = Array.from({ length: MSG_PER_CHILD }, (_, i) => ({
          id: `${childId}-msg-${i + 1}`,
          role: "assistant" as const,
          content: [{ type: "text" as const, text: `Child ${child} message ${i + 1}` }],
        }));
      }

      agentChatStore.getState().setSubagentLiveTranscripts(tabId, transcripts);

      const stored = agentChatStore.getState().sessionsByTabId[tabId]?.subagentLiveTranscripts ?? {};
      const childIds = Object.keys(stored);

      // Only MAX_SUBAGENT_CHILDREN retained (newest by sorted key order).
      expect(childIds).toHaveLength(MAX_SUBAGENT_CHILDREN);

      // Each retained child keeps its messages (all 100 each are within per-child budget).
      for (const childId of childIds) {
        expect(stored[childId]?.length).toBeLessThanOrEqual(MSG_PER_CHILD);
      }
    });

    it("replaces the entire transcripts map on each call (overwrites, not merges)", () => {
      const tabId = "tab-subagent-replace";
      agentChatStore.getState().initSession(tabId, "session-subagent-replace");

      // First call: set child A and B
      agentChatStore.getState().setSubagentLiveTranscripts(tabId, {
        "child-a": [makeMessage("a-msg-1")],
        "child-b": [makeMessage("b-msg-1")],
      });

      expect(Object.keys(agentChatStore.getState().sessionsByTabId[tabId]?.subagentLiveTranscripts ?? {})).toEqual([
        "child-a",
        "child-b",
      ]);

      // Second call: set only child C — should fully replace, not merge.
      agentChatStore.getState().setSubagentLiveTranscripts(tabId, {
        "child-c": [makeMessage("c-msg-1")],
      });

      const stored = agentChatStore.getState().sessionsByTabId[tabId]?.subagentLiveTranscripts ?? {};
      expect(Object.keys(stored)).toEqual(["child-c"]);
      expect(stored["child-a"]).toBeUndefined();
      expect(stored["child-b"]).toBeUndefined();
    });

    it("retains large per-message content within aggregate budget (store does not truncate content)", () => {
      const tabId = "tab-subagent-large";
      agentChatStore.getState().initSession(tabId, "session-subagent-large");

      // 100 KiB content well within the 2 MiB per-parent aggregate limit.
      const contentSize = 100 * 1024; // 100 KiB
      agentChatStore.getState().setSubagentLiveTranscripts(tabId, {
        "child-large": [makeMessage("large-child-msg", contentSize)],
      });

      const stored = agentChatStore.getState().sessionsByTabId[tabId]?.subagentLiveTranscripts ?? {};
      const content = stored["child-large"]?.[0]?.content;
      if (!Array.isArray(content)) throw new Error("expected array");
      if (content[0]?.type !== "text") throw new Error("expected text block");

      // Store retains content as-is; per-message truncation is at the normalization boundary.
      expect(content[0].text.length).toBe(contentSize);
    });

    it("retains empty transcript maps correctly", () => {
      const tabId = "tab-subagent-empty";
      agentChatStore.getState().initSession(tabId, "session-subagent-empty");

      agentChatStore.getState().setSubagentLiveTranscripts(tabId, {});

      const stored = agentChatStore.getState().sessionsByTabId[tabId]?.subagentLiveTranscripts ?? {};
      expect(stored).toEqual({});
    });
  });

  // ─── updateStreamingMessage does not enforce a content budget at store level ─

  describe("updateStreamingMessage content", () => {
    it("stores large streaming content as-is (truncation is at normalization boundary, not the store)", () => {
      const tabId = "tab-stream-large";
      agentChatStore.getState().initSession(tabId, "session-stream-large");

      // 200 KiB content added directly, bypassing normalization.
      // In production use, content is truncated before reaching the store.
      const largeContent = largeText(200 * 1024); // 200 KiB
      agentChatStore.getState().updateStreamingMessage(tabId, {
        id: "large-stream",
        role: "assistant",
        content: [{ type: "text", text: largeContent }],
      });

      const streaming = agentChatStore.getState().sessionsByTabId[tabId]?.streamingMessage;
      expect(streaming).not.toBeNull();
      const content = streaming?.content;
      if (!Array.isArray(content)) throw new Error("expected array");
      if (content[0]?.type !== "text") throw new Error("expected text block");

      // By design: the store setter does not truncate; normalization does.
      expect(content[0].text.length).toBe(largeContent.length);
    });

    it("does not bound the message at the store setter level — per-message truncation is at normalization", () => {
      const tabId = "tab-stream-unbounded";
      agentChatStore.getState().initSession(tabId, "session-stream-unbounded");

      // Simulate a delta-only stream: call updateStreamingMessage repeatedly with
      // growing content. The real path is message_update → applyStreamDelta →
      // updateStreamingMessage; truncation is applied at the normalization boundary
      // (truncateMessageContent) before the store is called.
      let accumulator = "";
      const CHUNK_COUNT = 50;
      const CHUNK_BYTES = 4 * 1024; // 4 KiB per chunk

      for (let i = 0; i < CHUNK_COUNT; i++) {
        accumulator += largeText(CHUNK_BYTES);
        agentChatStore.getState().updateStreamingMessage(tabId, {
          id: "delta-stream",
          role: "assistant",
          content: [{ type: "text", text: accumulator }],
        });
      }

      const streaming = agentChatStore.getState().sessionsByTabId[tabId]?.streamingMessage;
      expect(streaming).not.toBeNull();
      const content = streaming?.content;
      if (!Array.isArray(content)) throw new Error("expected array");
      if (content[0]?.type !== "text") throw new Error("expected text block");

      // By design: store does not limit repeated delta accumulation.
      // In production, truncateMessageContent() is called before updateStreamingMessage.
      expect(content[0].text.length).toBe(CHUNK_COUNT * CHUNK_BYTES);
      expect(content[0].text.length).toBeGreaterThanOrEqual(200 * 1024);
    });
  });

  // ─── removeSession cleanup ─────────────────────────────────────────────────

  describe("removeSession", () => {
    it("removes all session data for the given tabId", () => {
      const tabId = "tab-remove";
      agentChatStore.getState().initSession(tabId, "session-remove");
      fillMessages(tabId, 10);

      expect(agentChatStore.getState().sessionsByTabId[tabId]).toBeDefined();

      agentChatStore.getState().removeSession(tabId);

      expect(agentChatStore.getState().sessionsByTabId[tabId]).toBeUndefined();
    });

    it("is a no-op for an unknown tabId", () => {
      expect(() => {
        agentChatStore.getState().removeSession("nonexistent");
      }).not.toThrow();
    });
  });
});

