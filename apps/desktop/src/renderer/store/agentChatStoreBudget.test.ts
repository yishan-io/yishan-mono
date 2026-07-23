// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { agentChatStore } from "./agentChatStore";
import type { AgentMessage } from "./agentChatTypes";

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
  it(
    "appendMessage evicts oldest messages when aggregate exceeds 8 MiB",
    { timeout: 60_000 },
    () => {
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
    },
  );

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
