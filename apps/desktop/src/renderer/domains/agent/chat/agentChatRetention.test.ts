import { describe, expect, it } from "vitest";
import { MAX_PER_TAB_AGGREGATE_UTF8_BYTES } from "./agentChatBudget";
import {
  MAX_MESSAGES_PER_TAB,
  getRetainedToolResultIds,
  mergeActiveTurnHistory,
  trimSessionMessages,
} from "./agentChatRetention";
import type { AgentMessage } from "./agentChatTypes";

describe("mergeActiveTurnHistory", () => {
  it("replaces committed messages with history when an empty final-assistant map is supplied", () => {
    const committedMessage = {
      id: "assistant-1",
      role: "assistant",
      content: [{ type: "text" as const, text: "Stale renderer message" }],
    } satisfies AgentMessage;
    const historyMessage = {
      ...committedMessage,
      content: [{ type: "text" as const, text: "Replacement history message" }],
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([historyMessage], [committedMessage], {})).toEqual([historyMessage]);
  });

  it("deduplicates same-ID history messages while retaining their tool result", () => {
    const toolCall = {
      id: "assistant-1",
      role: "assistant" as const,
      content: [{ type: "toolCall" as const, id: "tool-call-1", name: "Read", arguments: {} }],
    } satisfies AgentMessage;
    const toolResult = {
      id: "tool-result-1",
      role: "toolResult" as const,
      toolCallId: "tool-call-1",
      toolName: "Read",
      content: "file contents",
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([toolCall, toolCall, toolResult], [], {})).toEqual([toolCall, toolResult]);
  });

  it("retains the latest same-ID assistant so its matching tool result remains associated", () => {
    const olderAssistant = {
      id: "assistant-1",
      role: "assistant" as const,
      content: [{ type: "toolCall" as const, id: "tool-call-old", name: "Read", arguments: {} }],
    } satisfies AgentMessage;
    const newerAssistant = {
      ...olderAssistant,
      content: [{ type: "toolCall" as const, id: "tool-call-new", name: "Read", arguments: {} }],
    } satisfies AgentMessage;
    const newerToolResult = {
      id: "tool-result-1",
      role: "toolResult" as const,
      toolCallId: "tool-call-new",
      toolName: "Read",
      content: "newer file contents",
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([olderAssistant, newerAssistant, newerToolResult], [], {})).toEqual([
      newerAssistant,
      newerToolResult,
    ]);
  });

  it("keeps live subagent lifecycle messages missing from RPC history", () => {
    const liveLifecycle = {
      id: "child-1:started",
      role: "custom" as const,
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: { event: "started", mode: "background", childSessionId: "child-1" },
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([], [liveLifecycle], {})).toEqual([liveLifecycle]);
  });

  it("places retained lifecycle messages before history so history wins trimming", () => {
    const historyMessage = {
      id: "assistant-1",
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "Persisted history" }],
    };
    const liveLifecycle = {
      id: "child-1:started",
      role: "custom" as const,
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: { event: "started", mode: "background", childSessionId: "child-1" },
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([historyMessage], [liveLifecycle], {})).toEqual([liveLifecycle, historyMessage]);
  });

  it("discards stale history lifecycle state for a retained child", () => {
    const staleHistoryStart = {
      id: "child-1:started",
      role: "custom" as const,
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: { event: "started", mode: "background", childSessionId: "child-1" },
    } satisfies AgentMessage;
    const liveCompletion = {
      id: "child-1:completed",
      role: "custom" as const,
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: { event: "completed", mode: "background", childSessionId: "child-1" },
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([staleHistoryStart], [liveCompletion], {})).toEqual([liveCompletion]);
  });

  it("prefers a terminal lifecycle state from history over a retained live start", () => {
    const liveStart = {
      id: "child-1:started",
      role: "custom" as const,
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: { event: "started", mode: "background", childSessionId: "child-1" },
    } satisfies AgentMessage;
    const historyCompletion = {
      id: "child-1:completed",
      role: "custom" as const,
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: { event: "completed", mode: "background", childSessionId: "child-1" },
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([historyCompletion], [liveStart], {})).toEqual([historyCompletion]);
  });

  it("does not duplicate retained lifecycle messages with default final-assistant handling", () => {
    const liveLifecycle = {
      id: "child-1:started",
      role: "custom" as const,
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: { event: "started", mode: "background", childSessionId: "child-1" },
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([], [liveLifecycle])).toEqual([liveLifecycle]);
  });

  it("keeps live foreground lifecycle messages absent from RPC history", () => {
    const foregroundLifecycle = {
      id: "child-1:started",
      role: "custom" as const,
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: { event: "started", mode: "foreground", childSessionId: "child-1" },
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([], [foregroundLifecycle], {})).toEqual([foregroundLifecycle]);
  });

  it("does not retain unrelated custom messages absent from RPC history", () => {
    const unrelatedCustomMessage = {
      id: "custom-1",
      role: "custom" as const,
      customType: "unrelated-extension",
      display: false,
      content: "",
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([], [unrelatedCustomMessage], {})).toEqual([]);
  });

  it("preserves an unmatched tool result persisted in history", () => {
    const persistedToolResult = {
      id: "tool-result-persisted",
      role: "toolResult" as const,
      toolCallId: "missing-tool-call",
      toolName: "Read",
      content: "persisted standalone result",
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([persistedToolResult], [], {})).toEqual([persistedToolResult]);
  });

  it("does not retain an orphan tool result absent from RPC history", () => {
    const finalizedAssistant = {
      id: "assistant-1",
      role: "assistant" as const,
      content: [{ type: "toolCall" as const, id: "tool-call-1", name: "Read", arguments: {} }],
    } satisfies AgentMessage;
    const orphanToolResult = {
      id: "tool-result-orphan",
      role: "toolResult" as const,
      toolCallId: "tool-call-2",
      toolName: "Read",
      content: "unrelated result",
    } satisfies AgentMessage;

    expect(
      mergeActiveTurnHistory([finalizedAssistant], [finalizedAssistant, orphanToolResult], { "assistant-1": true }),
    ).toEqual([finalizedAssistant]);
  });

  it("keeps an injected tool-call owner immediately before its history result through count trimming", () => {
    const toolCallOwner = {
      id: "assistant-tool-call",
      role: "assistant" as const,
      content: [{ type: "toolCall" as const, id: "tool-call-1", name: "Read", arguments: {} }],
    } satisfies AgentMessage;
    const toolResult = {
      id: "tool-result-1",
      role: "toolResult" as const,
      toolCallId: "tool-call-1",
      toolName: "Read",
      content: "file contents",
    } satisfies AgentMessage;
    const historyMessages: AgentMessage[] = [
      ...Array.from({ length: MAX_MESSAGES_PER_TAB }, (_, index) => ({
        id: `history-${index}`,
        role: "assistant" as const,
        content: [{ type: "text" as const, text: `History ${index}` }],
      })),
      toolResult,
    ];

    const merged = mergeActiveTurnHistory(historyMessages, [toolCallOwner], {}, { [toolCallOwner.id]: true });
    const trimmed = trimSessionMessages(merged);

    expect(trimmed).toHaveLength(MAX_MESSAGES_PER_TAB);
    expect(trimmed.slice(-2)).toEqual([toolCallOwner, toolResult]);
  });

  it("evicts an injected history result when count trimming evicts its owner", () => {
    const toolCallOwner = {
      id: "assistant-tool-call",
      role: "assistant" as const,
      content: [{ type: "toolCall" as const, id: "tool-call-1", name: "Read", arguments: {} }],
    } satisfies AgentMessage;
    const toolResult = {
      id: "tool-result-1",
      role: "toolResult" as const,
      toolCallId: "tool-call-1",
      toolName: "Read",
      content: "file contents",
    } satisfies AgentMessage;
    const historyMessages: AgentMessage[] = [
      toolResult,
      ...Array.from({ length: MAX_MESSAGES_PER_TAB }, (_, index) => ({
        id: `history-${index}`,
        role: "assistant" as const,
        content: [{ type: "text" as const, text: `History ${index}` }],
      })),
    ];
    const finalizedToolCallOwners: Record<string, true> = { [toolCallOwner.id]: true };

    const merged = mergeActiveTurnHistory(historyMessages, [toolCallOwner], {}, finalizedToolCallOwners);
    const retainedToolResultIds = getRetainedToolResultIds(
      historyMessages,
      [toolCallOwner],
      {},
      finalizedToolCallOwners,
    );
    const trimmed = trimSessionMessages(merged, retainedToolResultIds);

    expect(retainedToolResultIds).toEqual(new Set([toolResult.id]));
    expect(trimmed).toHaveLength(MAX_MESSAGES_PER_TAB);
    expect(trimmed.some((message) => message.id === toolCallOwner.id || message.id === toolResult.id)).toBe(false);
  });

  it("removes a transient tool result when byte trimming evicts its matching assistant", () => {
    const finalizedAssistant = {
      id: "assistant-1",
      role: "assistant" as const,
      content: [{ type: "toolCall" as const, id: "tool-call-1", name: "Read", arguments: {} }],
    } satisfies AgentMessage;
    const retainedToolResult = {
      id: "tool-result-1",
      role: "toolResult" as const,
      toolCallId: "tool-call-1",
      toolName: "Read",
      content: "file contents",
    } satisfies AgentMessage;
    const budgetFillingHistory = {
      id: "history-1",
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "x".repeat(MAX_PER_TAB_AGGREGATE_UTF8_BYTES) }],
    } satisfies AgentMessage;

    expect(
      trimSessionMessages(
        [finalizedAssistant, budgetFillingHistory, retainedToolResult],
        new Set([retainedToolResult.id]),
      ),
    ).toEqual([]);
  });

  it("keeps the committed finalized message over a stale same-ID history placeholder", () => {
    const finalized = {
      id: "assistant-1",
      role: "assistant",
      content: [{ type: "text" as const, text: "Final response" }],
      usage: {
        input: 10,
        output: 20,
        cacheRead: 30,
        cacheWrite: 40,
        total: 100,
        totalTokens: 100,
        cost: { total: 0.01 },
      },
      stopReason: "stop",
      timestamp: 3_000,
      startedAtMs: 1_000,
      durationMs: 2_000,
    } satisfies AgentMessage;
    const stalePlaceholder = {
      id: finalized.id,
      role: "assistant",
      content: [],
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([stalePlaceholder], [finalized])).toEqual([finalized]);
  });
});
