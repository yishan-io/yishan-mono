// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../chat/agentChatTypes";
import { agentChatStore } from "./agentChatStore";
import {
  createAgentChatSession,
  isHydrated,
  selectFinishedSubagents,
  selectRunningSubagents,
} from "./agentChatStoreSession";

const initialAgentChatStoreState = agentChatStore.getState();

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  vi.clearAllMocks();
});

describe("agent chat session hydration", () => {
  it.each([
    ["absent session", undefined, false],
    ["no resources", { messages: false, models: false, state: false }, false],
    ["messages only", { messages: true, models: false, state: false }, false],
    ["models only", { messages: false, models: true, state: false }, false],
    ["state only", { messages: false, models: false, state: true }, false],
    ["messages and models", { messages: true, models: true, state: false }, false],
    ["messages and state", { messages: true, models: false, state: true }, false],
    ["models and state", { messages: false, models: true, state: true }, false],
    ["every resource", { messages: true, models: true, state: true }, true],
  ])("isHydrated is %s", (_description, hydration, expected) => {
    const session = hydration ? { ...createAgentChatSession("session-1"), hydration } : undefined;
    expect(isHydrated(session)).toBe(expected);
  });

  it.each([
    ["replaceMessages", (tabId: string) => agentChatStore.getState().replaceMessages(tabId, []), "messages"],
    ["setAvailableModels", (tabId: string) => agentChatStore.getState().setAvailableModels(tabId, []), "models"],
    ["markStateLoaded", (tabId: string) => agentChatStore.getState().markStateLoaded(tabId), "state"],
  ] as const)("%s marks only its hydration resource", (_name, write, resource) => {
    const tabId = `tab-${resource}`;
    agentChatStore.getState().initSession(tabId, "session-1");

    write(tabId);

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.hydration).toEqual({
      messages: resource === "messages",
      models: resource === "models",
      state: resource === "state",
    });
  });
});

const MAX_SUBAGENT_CHILDREN = 20;

function largeText(sizeBytes: number): string {
  const pattern = "Data line with varied content for realistic memory profiling. ";
  const chars: string[] = [];
  while (chars.join("").length < sizeBytes) chars.push(pattern);
  return chars.join("").slice(0, sizeBytes);
}

function makeMessage(id: string, contentSize?: number) {
  return {
    id,
    role: "assistant" as const,
    content: contentSize
      ? [{ type: "text" as const, text: largeText(contentSize) }]
      : [{ type: "text" as const, text: `Message ${id}` }],
  };
}

function fillMessages(tabId: string, count: number, prefix = "fill"): void {
  for (let index = 1; index <= count; index += 1) {
    agentChatStore.getState().appendMessage(tabId, makeMessage(`${prefix}-${index}`));
  }
}

describe("agentChatStore", () => {
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

  // ─── subagentCancelStates ──────────────────────────────────────────────────

  describe("subagentCancelStates", () => {
    it("stores and clears per-row cancel feedback", () => {
      const tabId = "tab-cancel-state";
      agentChatStore.getState().initSession(tabId, "session-cancel-state");

      agentChatStore.getState().setSubagentCancelState(tabId, "child-session-1", { status: "cancelling" });
      expect(agentChatStore.getState().sessionsByTabId[tabId]?.subagentCancelStates).toEqual({
        "child-session-1": { status: "cancelling" },
      });

      agentChatStore
        .getState()
        .setSubagentCancelState(tabId, "child-session-1", { status: "failed", reason: "timeout" });
      expect(agentChatStore.getState().sessionsByTabId[tabId]?.subagentCancelStates).toEqual({
        "child-session-1": { status: "failed", reason: "timeout" },
      });

      agentChatStore.getState().clearSubagentCancelState(tabId, "child-session-1");
      expect(agentChatStore.getState().sessionsByTabId[tabId]?.subagentCancelStates).toEqual({});
    });

    it("defaults to an empty map on a fresh session", () => {
      const tabId = "tab-cancel-default";
      agentChatStore.getState().initSession(tabId, "session-cancel-default");

      expect(agentChatStore.getState().sessionsByTabId[tabId]?.subagentCancelStates).toEqual({});
    });

    it("is a no-op for unknown tab ids", () => {
      expect(() => {
        agentChatStore.getState().setSubagentCancelState("missing-tab", "row-1", { status: "cancelling" });
        agentChatStore.getState().clearSubagentCancelState("missing-tab", "row-1");
      }).not.toThrow();
    });
  });

  // ─── running subagent panel state ─────────────────────────────────────────

  describe("running subagent panel state", () => {
    it("retains a foreground start through stale history until persisted completion replaces it", () => {
      const tabId = "tab-foreground-lifecycle-retention";
      agentChatStore.getState().initSession(tabId, "session-foreground-lifecycle-retention");

      const startedMessage = {
        id: "child-session-1:started",
        role: "custom" as const,
        customType: "pi-subagent-child",
        display: false,
        content: "",
        details: {
          event: "started",
          mode: "foreground",
          agentId: "agent-1",
          agentName: "builder",
          childSessionId: "child-session-1",
          title: "builder — implement retention",
          summary: "implement retention",
        },
      } satisfies AgentMessage;
      const completedMessage = {
        ...startedMessage,
        id: "child-session-1:completed",
        details: { ...startedMessage.details, event: "completed" },
      } satisfies AgentMessage;

      agentChatStore.getState().appendMessage(tabId, startedMessage);
      agentChatStore.getState().replaceMessages(tabId, []);

      let session = agentChatStore.getState().sessionsByTabId[tabId];
      expect(session?.messages).toEqual([startedMessage]);
      expect(selectRunningSubagents(session)).toEqual([
        expect.objectContaining({ childSessionId: "child-session-1", state: "running" }),
      ]);

      agentChatStore.getState().replaceMessages(tabId, [completedMessage]);

      session = agentChatStore.getState().sessionsByTabId[tabId];
      expect(session?.messages).toEqual([completedMessage]);
      expect(selectRunningSubagents(session)).toEqual([]);
      expect(selectFinishedSubagents(session)).toEqual([
        expect.objectContaining({ childSessionId: "child-session-1" }),
      ]);
    });

    it("derives finished rows from committed messages and not the streaming message", () => {
      const tabId = "tab-finished-committed";
      agentChatStore.getState().initSession(tabId, "session-finished-committed");
      agentChatStore.getState().updateStreamingMessage(tabId, {
        id: "completed-child",
        role: "custom",
        customType: "pi-subagent-child",
        display: false,
        content: "",
        details: {
          event: "completed",
          agentId: "agent-1",
          agentName: "builder",
          childSessionId: "child-session-1",
        },
      });

      expect(selectFinishedSubagents(agentChatStore.getState().sessionsByTabId[tabId])).toEqual([]);

      agentChatStore.getState().finalizeStreamingMessage(tabId);
      expect(selectFinishedSubagents(agentChatStore.getState().sessionsByTabId[tabId])).toEqual([
        expect.objectContaining({ childSessionId: "child-session-1" }),
      ]);
    });

    it("updates an existing Agent row from preparing to queued when its background result arrives", () => {
      const tabId = "tab-background-subagent";
      agentChatStore.getState().initSession(tabId, "session-background-subagent");

      agentChatStore.getState().appendMessage(tabId, {
        id: "assistant-agent-call",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tool-background-agent",
            name: "Agent",
            arguments: { agent: "builder", prompt: "Implement the panel." },
          },
        ],
      });

      expect(selectRunningSubagents(agentChatStore.getState().sessionsByTabId[tabId])).toEqual([
        expect.objectContaining({ rowId: "tool-background-agent", state: "preparing" }),
      ]);

      agentChatStore.getState().appendMessage(tabId, {
        id: "background-agent-result",
        role: "toolResult",
        toolName: "Agent",
        toolCallId: "tool-background-agent",
        content: [],
        details: { mode: "background" },
      });

      expect(selectRunningSubagents(agentChatStore.getState().sessionsByTabId[tabId])).toEqual([
        expect.objectContaining({ rowId: "tool-background-agent", state: "queued" }),
      ]);
    });
  });

  // ─── subagentSessionEndedAtMs ──────────────────────────────────────────────

  describe("subagentSessionEndedAtMs", () => {
    it("defaults to null and updates via setSubagentSessionEndedAt", () => {
      const tabId = "tab-session-ended";
      agentChatStore.getState().initSession(tabId, "session-session-ended");

      expect(agentChatStore.getState().sessionsByTabId[tabId]?.subagentSessionEndedAtMs).toBeNull();

      agentChatStore.getState().setSubagentSessionEndedAt(tabId, 1_700_000_000_000);
      expect(agentChatStore.getState().sessionsByTabId[tabId]?.subagentSessionEndedAtMs).toBe(1_700_000_000_000);

      agentChatStore.getState().setSubagentSessionEndedAt(tabId, null);
      expect(agentChatStore.getState().sessionsByTabId[tabId]?.subagentSessionEndedAtMs).toBeNull();
    });

    it("re-derives runningSubagents when the session end time changes", () => {
      const tabId = "tab-session-ended-rows";
      agentChatStore.getState().initSession(tabId, "session-session-ended-rows");

      const startedMessage: AgentMessage = {
        id: "subagent-start-1",
        role: "custom",
        customType: "pi-subagent-child",
        display: false,
        content: "",
        timestamp: 1_700_000_000_000,
        details: {
          event: "started",
          agentId: "agent-1",
          agentName: "builder",
          title: "builder — interrupted work",
          summary: "interrupted work",
          childSessionId: "child-session-1",
        },
      };
      agentChatStore.getState().appendMessage(tabId, startedMessage);

      expect(selectRunningSubagents(agentChatStore.getState().sessionsByTabId[tabId])).toEqual([
        expect.objectContaining({ childSessionId: "child-session-1" }),
      ]);

      agentChatStore.getState().setSubagentSessionEndedAt(tabId, 1_700_000_000_500);
      expect(selectRunningSubagents(agentChatStore.getState().sessionsByTabId[tabId])).toEqual([]);

      agentChatStore.getState().setSubagentSessionEndedAt(tabId, null);
      expect(selectRunningSubagents(agentChatStore.getState().sessionsByTabId[tabId])).toEqual([
        expect.objectContaining({ childSessionId: "child-session-1" }),
      ]);
    });

    it("is a no-op for unknown tab ids", () => {
      expect(() => {
        agentChatStore.getState().setSubagentSessionEndedAt("missing-tab", Date.now());
      }).not.toThrow();
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

describe("DSH delegation lifecycle", () => {
  it("preserves a settlement diagnostic when lifecycle arrives after settlement", () => {
    const store = agentChatStore.getState();
    store.initSession("tab", "parent");
    store.setDshDelegationLifecycle("tab", {
      childSessionId: "child",
      state: "error",
      diagnostic: { reason: "max-tokens" },
    });
    store.setDshDelegationLifecycle("tab", { childSessionId: "child", state: "error" });

    expect(agentChatStore.getState().sessionsByTabId.tab?.dshDelegationLifecycleByChildSessionId.child).toEqual({
      childSessionId: "child",
      state: "error",
      diagnostic: { reason: "max-tokens" },
    });
  });
});
