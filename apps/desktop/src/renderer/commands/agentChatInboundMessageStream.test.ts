// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../store/agentChatStore";
import { handleAgentPiEvent } from "./agentChatCommands";
import { flushAgentChatStreamBuffer, setAgentChatStreamTabVisible } from "./agentChatStreamBuffer";
import { MAX_DETAILS_ITEMS, MAX_DETAILS_STRING_UTF8_BYTES } from "./agentChatInboundMessage";

const initialAgentChatStoreState = agentChatStore.getState();

vi.mock("../helpers/generateId", () => ({
  generateId: vi.fn(() => "generated-id"),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  vi.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a string of `sizeBytes` ASCII characters. */
function largeAsciiText(sizeBytes: number): string {
  const chars: string[] = [];
  const pattern = "Tool output line with some varied content for realistic memory profiling. ";
  while (chars.join("").length < sizeBytes) {
    chars.push(pattern);
  }
  return chars.join("").slice(0, sizeBytes);
}

// ─── Singleton router: event arrives only at the registered tab ───────────────
// The per-view direct frontendStream subscriptions were replaced by a single
// shared router (Task 2). Full contract is tested in agentChatEventRouter.test.ts;
// this fixture confirms the production integration routes to one tab only.

describe("router delivers events only to the matching registered tab/session", () => {
  it("routes a Pi agent_start event only to the tab whose tabId and sessionId match", () => {
    const tabA = "router-tab-a";
    const tabB = "router-tab-b";
    const sessionA = "session-a";
    const sessionB = "session-b";

    agentChatStore.getState().initSession(tabA, sessionA);
    agentChatStore.getState().initSession(tabB, sessionB);

    // Drive a state change via handleAgentPiEvent targeting only tabA.
    handleAgentPiEvent({ sessionId: sessionA, tabId: tabA, workspaceId: "w", event: { type: "agent_start" } });

    expect(agentChatStore.getState().sessionsByTabId[tabA]?.state).toBe("running");
    // tabB must not be affected.
    expect(agentChatStore.getState().sessionsByTabId[tabB]?.state).toBe("idle");
  });
});

// ─── toolcall_end delta with large arguments is bounded ──────────────────────

describe("toolcall_end delta — arguments are bounded by normalizeBoundedDetails", () => {
  it(
    "bounds ~300 KiB nested toolcall_end arguments to MAX_DETAILS_STRING_UTF8_BYTES per string value",
    { timeout: 30_000 },
    () => {
      const tabId = "tab-toolcall-end-large";
      const sessionId = "session-toolcall-end-large";
      agentChatStore.getState().initSession(tabId, sessionId);

      // Mark the tab as not visible so the stream buffer uses setTimeout
      // rather than requestAnimationFrame (not available in all test envs).
      flushAgentChatStreamBuffer(tabId); // ensure clean state
      setAgentChatStreamTabVisible(tabId, false);

      // Set up a streaming message that has a toolCall block at index 0,
      // as if a toolcall_start delta was previously applied.
      agentChatStore.getState().updateStreamingMessage(tabId, {
        id: "streaming-toolcall",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-large",
            name: "run_command",
            arguments: {},
          },
        ],
      });

      // Build ~300 KiB of nested arguments with large string values.
      const LARGE_VALUE_BYTES = 10 * 1024; // 10 KiB per value
      const largeArgs: Record<string, unknown> = {};
      for (let i = 0; i < 30; i++) {
        largeArgs[`key-${i}`] = largeAsciiText(LARGE_VALUE_BYTES); // 30 × 10 KiB = 300 KiB
      }
      largeArgs.nested = {
        deepKey: largeAsciiText(LARGE_VALUE_BYTES),
        items: Array.from({ length: 50 }, () => largeAsciiText(1024)),
      };

      // Drive handleAgentPiEvent with message_update + toolcall_end delta.
      handleAgentPiEvent({
        sessionId,
        tabId,
        workspaceId: "workspace-1",
        event: {
          type: "message_update",
          message: undefined,
          assistantMessageEvent: {
            type: "toolcall_end",
            contentIndex: 0,
            toolCallId: "call-large",
            toolCall: {
              id: "call-large",
              name: "run_command",
              arguments: largeArgs,
            },
          },
        },
      });

      // Force immediate flush (cancels the scheduled setTimeout flush).
      flushAgentChatStreamBuffer(tabId);

      const streaming = agentChatStore.getState().sessionsByTabId[tabId]?.streamingMessage;
      expect(streaming).not.toBeNull();
      const content = streaming?.content;
      expect(Array.isArray(content)).toBe(true);
      if (!Array.isArray(content)) throw new Error("expected array");
      expect(content[0]?.type).toBe("toolCall");
      if (content[0]?.type !== "toolCall") throw new Error("expected toolCall block");

      const args = content[0].arguments;
      const encoder = new TextEncoder();

      // Each top-level string value must be bounded to MAX_DETAILS_STRING_UTF8_BYTES.
      for (const value of Object.values(args)) {
        if (typeof value === "string") {
          expect(encoder.encode(value).byteLength).toBeLessThanOrEqual(MAX_DETAILS_STRING_UTF8_BYTES);
        }
      }

      // Key count must be bounded to MAX_DETAILS_ITEMS (100).
      expect(Object.keys(args).length).toBeLessThanOrEqual(MAX_DETAILS_ITEMS);
    },
  );
});
