// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../store/agentChatStore";
import type { AgentMessage } from "../store/agentChatTypes";
import { handleAgentPiEvent } from "./agentChatCommands";
import { flushAgentChatStreamBuffer, setAgentChatStreamTabVisible } from "./agentChatStreamBuffer";
import { MAX_DETAILS_ITEMS, MAX_DETAILS_STRING_UTF8_BYTES, PER_MESSAGE_UTF8_BYTES } from "./agentChatInboundMessage";

const initialAgentChatStoreState = agentChatStore.getState();

vi.mock("../helpers/generateId", () => ({
  generateId: vi.fn(() => "generated-id"),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  vi.clearAllMocks();
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Returns a string of `sizeBytes` ASCII characters. */
function largeAsciiText(sizeBytes: number): string {
  // Each ASCII char is 1 byte in UTF-8.
  const chars: string[] = [];
  // Use a rotating pattern so the string is not trivially compressible.
  const pattern = "Tool output line with some varied content for realistic memory profiling. ";
  while (chars.join("").length < sizeBytes) {
    chars.push(pattern);
  }
  return chars.join("").slice(0, sizeBytes);
}

/** Returns a string containing multi-byte Unicode characters. */
function largeUnicodeText(sizeBytes: number): string {
  // Each emoji is 4 bytes in UTF-8.
  const emoji = "🚀";
  const padding = "x"; // 1 byte
  const chars: string[] = [];
  while (chars.join("").length < sizeBytes) {
    chars.push(emoji + padding.repeat(20));
  }
  return chars.join("").slice(0, sizeBytes);
}

/** Builds a toolResult agent message with large content. */
function makeToolResultMessage(opts: {
  id?: string;
  contentSizeBytes: number;
  contentType?: "ascii" | "unicode";
}): AgentMessage {
  const content =
    opts.contentType === "unicode" ? largeUnicodeText(opts.contentSizeBytes) : largeAsciiText(opts.contentSizeBytes);
  return {
    id: opts.id ?? "tool-result-1",
    role: "toolResult",
    content,
    toolCallId: "call-1",
    toolName: "read",
  };
}

/** Builds an assistant message with content blocks. */
function makeAssistantMessage(opts: {
  id: string;
  text?: string;
}): AgentMessage {
  return {
    id: opts.id,
    role: "assistant",
    content: opts.text ? [{ type: "text", text: opts.text }] : [{ type: "text", text: "Done." }],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("agentChatInboundMessage — bounded normalization behavior", () => {
  // ─── Large tool results are now truncated ──────────────────────────────────

  describe("large tool results", () => {
    it("truncates 100 KiB of ASCII tool result content to ≤ PER_MESSAGE_UTF8_BYTES", () => {
      const tabId = "tab-large-ascii";
      const sessionId = "session-large-ascii";
      agentChatStore.getState().initSession(tabId, sessionId);

      const CONTENT_SIZE = 100 * 1024; // 100 KiB — exceeds the 64 KiB budget
      handleAgentPiEvent({
        sessionId,
        tabId,
        workspaceId: "workspace-1",
        event: {
          type: "message_end",
          message: makeToolResultMessage({ id: "tool-100k-ascii", contentSizeBytes: CONTENT_SIZE }),
        },
      });

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages).toHaveLength(1);
      const content = messages[0]?.content;
      expect(typeof content).toBe("string");

      const encoder = new TextEncoder();
      const byteLength = encoder.encode(content as string).byteLength;
      expect(byteLength).toBeLessThanOrEqual(PER_MESSAGE_UTF8_BYTES);
      expect(content as string).toMatch(/…\[truncated\]$/);
    });

    it("truncates 100 KiB of Unicode (multi-byte emoji) tool result content at a safe UTF-8 boundary", () => {
      const tabId = "tab-large-unicode";
      const sessionId = "session-large-unicode";
      agentChatStore.getState().initSession(tabId, sessionId);

      const CONTENT_SIZE = 100 * 1024; // 100 KiB
      handleAgentPiEvent({
        sessionId,
        tabId,
        workspaceId: "workspace-1",
        event: {
          type: "message_end",
          message: makeToolResultMessage({
            id: "tool-100k-unicode",
            contentSizeBytes: CONTENT_SIZE,
            contentType: "unicode",
          }),
        },
      });

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages).toHaveLength(1);
      const content = messages[0]?.content;
      expect(typeof content).toBe("string");

      const encoder = new TextEncoder();
      const byteLength = encoder.encode(content as string).byteLength;
      expect(byteLength).toBeLessThanOrEqual(PER_MESSAGE_UTF8_BYTES);
      expect(content as string).toMatch(/…\[truncated\]$/);
      // Verify the result is valid decodable UTF-8 (no split multi-byte sequences).
      expect(() => new TextDecoder().decode(encoder.encode(content as string))).not.toThrow();
    });

    it("truncates a 1 MiB tool result to fit within PER_MESSAGE_UTF8_BYTES", { timeout: 30_000 }, () => {
      const tabId = "tab-1mb";
      const sessionId = "session-1mb";
      agentChatStore.getState().initSession(tabId, sessionId);

      const ONE_MB = 1 * 1024 * 1024;
      handleAgentPiEvent({
        sessionId,
        tabId,
        workspaceId: "workspace-1",
        event: {
          type: "message_end",
          message: makeToolResultMessage({ id: "tool-1mb", contentSizeBytes: ONE_MB }),
        },
      });

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages).toHaveLength(1);
      const content = messages[0]?.content;
      expect(typeof content).toBe("string");

      const encoder = new TextEncoder();
      const byteLength = encoder.encode(content as string).byteLength;
      expect(byteLength).toBeLessThanOrEqual(PER_MESSAGE_UTF8_BYTES);
      expect(content as string).toMatch(/…\[truncated\]$/);
    });

    it("bounds large toolCall arguments to MAX_DETAILS_ITEMS keys with string values truncated to MAX_DETAILS_STRING_UTF8_BYTES", () => {
      const tabId = "tab-large-args";
      const sessionId = "session-large-args";
      agentChatStore.getState().initSession(tabId, sessionId);

      const largeArgs: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        largeArgs[`key-${i}`] = largeAsciiText(1024); // 1 KiB per value
      }

      handleAgentPiEvent({
        sessionId,
        tabId,
        workspaceId: "workspace-1",
        event: {
          type: "message_start",
          message: {
            id: "assistant-with-toolcalls",
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call-1",
                name: "execute",
                arguments: largeArgs,
              },
            ],
          },
        },
      });

      handleAgentPiEvent({
        sessionId,
        tabId,
        workspaceId: "workspace-1",
        event: {
          type: "message_end",
          message: {
            id: "assistant-with-toolcalls",
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call-1",
                name: "execute",
                arguments: largeArgs,
              },
            ],
          },
        },
      });

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages).toHaveLength(1);
      const content = messages[0]?.content;
      expect(Array.isArray(content)).toBe(true);
      if (!Array.isArray(content)) throw new Error("expected array");
      expect(content[0]?.type).toBe("toolCall");
      if (content[0]?.type !== "toolCall") throw new Error("expected toolCall block");

      // Post-fix: argument keys bounded to MAX_DETAILS_ITEMS (100).
      const args = content[0].arguments;
      expect(Object.keys(args).length).toBeLessThanOrEqual(MAX_DETAILS_ITEMS);

      // Each string value bounded to MAX_DETAILS_STRING_UTF8_BYTES.
      const encoder = new TextEncoder();
      for (const value of Object.values(args)) {
        if (typeof value === "string") {
          expect(encoder.encode(value).byteLength).toBeLessThanOrEqual(MAX_DETAILS_STRING_UTF8_BYTES);
        }
      }
    });
  });

  // ─── finalizeStreamingMessage now enforces MAX_MESSAGES_PER_TAB ───────────

  describe("finalizeStreamingMessage enforces MAX_MESSAGES_PER_TAB", () => {
    const MAX_MESSAGES = 500;

    it("enforces MAX_MESSAGES_PER_TAB cap when finalizing a streaming message", () => {
      const tabId = "tab-overflow";
      const sessionId = "session-overflow";
      agentChatStore.getState().initSession(tabId, sessionId);

      // Fill the store to exactly 500 messages via appendMessage.
      for (let i = 1; i <= MAX_MESSAGES; i++) {
        agentChatStore.getState().appendMessage(tabId, {
          id: `base-msg-${i}`,
          role: "assistant",
          content: `Content ${i}`,
        });
      }

      expect(agentChatStore.getState().sessionsByTabId[tabId]?.messages).toHaveLength(MAX_MESSAGES);

      // Finalize a streaming message via handleAgentPiEvent.
      handleAgentPiEvent({
        sessionId,
        tabId,
        workspaceId: "workspace-1",
        event: {
          type: "message_start",
          message: {
            id: "overflow-msg",
            role: "assistant",
            content: [{ type: "text", text: "This previously overflowed the cap." }],
          },
        },
      });

      handleAgentPiEvent({
        sessionId,
        tabId,
        workspaceId: "workspace-1",
        event: {
          type: "message_end",
          message: {
            id: "overflow-msg",
            role: "assistant",
            content: [{ type: "text", text: "This previously overflowed the cap." }],
          },
        },
      });

      // Cap is now enforced: oldest message trimmed, newest (overflow-msg) kept.
      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("overflow-msg");
    });

    it("keeps the count at MAX_MESSAGES_PER_TAB with repeated finalized turns", () => {
      const tabId = "tab-mega-overflow";
      const sessionId = "session-mega-overflow";
      agentChatStore.getState().initSession(tabId, sessionId);

      // Fill to 500 via appendMessage.
      for (let i = 1; i <= MAX_MESSAGES; i++) {
        agentChatStore.getState().appendMessage(tabId, {
          id: `base-msg-${i}`,
          role: "assistant",
          content: `Content ${i}`,
        });
      }

      // Finalize 50 more streaming messages.
      const EXTRA_TURNS = 50;
      for (let t = 1; t <= EXTRA_TURNS; t++) {
        const msgId = `overflow-turn-${t}`;
        handleAgentPiEvent({
          sessionId,
          tabId,
          workspaceId: "workspace-1",
          event: {
            type: "message_start",
            message: {
              id: msgId,
              role: "assistant",
              content: [{ type: "text", text: `Turn ${t}` }],
            },
          },
        });
        handleAgentPiEvent({
          sessionId,
          tabId,
          workspaceId: "workspace-1",
          event: {
            type: "message_end",
            message: {
              id: msgId,
              role: "assistant",
              content: [{ type: "text", text: `Turn ${t}` }],
            },
          },
        });
      }

      // Cap enforced: always exactly MAX_MESSAGES, newest turns retained.
      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages.length).toBe(MAX_MESSAGES);
      expect(messages[MAX_MESSAGES - 1]?.id).toBe(`overflow-turn-${EXTRA_TURNS}`);
    });

    it("appendMessage does enforce the 500 cap (control test)", () => {
      const tabId = "tab-control";
      const sessionId = "session-control";
      agentChatStore.getState().initSession(tabId, sessionId);

      // Append 600 messages via appendMessage.
      for (let i = 1; i <= 600; i++) {
        agentChatStore.getState().appendMessage(tabId, {
          id: `msg-${i}`,
          role: "assistant",
          content: `Content ${i}`,
        });
      }

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      // appendMessage enforces the 500 cap: oldest messages are trimmed.
      expect(messages.length).toBe(MAX_MESSAGES);
      expect(messages[0]?.id).toBe("msg-101"); // first 100 trimmed
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("msg-600");
    });

    it("replaceMessages enforces the 500 cap (control test)", () => {
      const tabId = "tab-replace";
      const sessionId = "session-replace";
      agentChatStore.getState().initSession(tabId, sessionId);

      const manyMessages: AgentMessage[] = Array.from({ length: 600 }, (_, i) => ({
        id: `history-msg-${i + 1}`,
        role: "assistant" as const,
        content: `History ${i + 1}`,
      }));

      agentChatStore.getState().replaceMessages(tabId, manyMessages);

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      // replaceMessages keeps the newest 500.
      expect(messages.length).toBe(MAX_MESSAGES);
      expect(messages[0]?.id).toBe("history-msg-101");
      expect(messages[MAX_MESSAGES - 1]?.id).toBe("history-msg-600");
    });
  });

  // ─── History responses with large content blocks ───────────────────────────

  describe("history response normalisation", () => {
    it("retains full content blocks from history replies with text under the budget", () => {
      const tabId = "tab-history-large";
      const sessionId = "session-history-large";
      agentChatStore.getState().initSession(tabId, sessionId);

      // 50 KiB is under the 64 KiB PER_MESSAGE_UTF8_BYTES budget — retained as-is.
      const largeText = largeAsciiText(50 * 1024);

      handleAgentPiEvent({
        sessionId,
        tabId,
        workspaceId: "workspace-1",
        event: {
          type: "response",
          command: "get_messages",
          success: true,
          data: {
            messages: [
              {
                id: "history-large-msg",
                role: "assistant",
                content: [{ type: "text", text: largeText }],
              },
            ],
          },
        },
      });

      const messages = agentChatStore.getState().sessionsByTabId[tabId]?.messages ?? [];
      expect(messages).toHaveLength(1);
      const content = messages[0]?.content;
      if (!Array.isArray(content)) throw new Error("expected array");
      if (content[0]?.type !== "text") throw new Error("expected text block");

      // 50 KiB < 64 KiB budget → not truncated.
      expect(content[0].text.length).toBe(largeText.length);
    });
  });

});

