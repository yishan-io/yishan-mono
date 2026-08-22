import { describe, expect, it } from "vitest";
import { mergeActiveTurnHistory } from "./agentChatRetention";
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

  it("does not retain foreground lifecycle messages absent from RPC history", () => {
    const foregroundLifecycle = {
      id: "child-1:started",
      role: "custom" as const,
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: { event: "started", mode: "foreground", childSessionId: "child-1" },
    } satisfies AgentMessage;

    expect(mergeActiveTurnHistory([], [foregroundLifecycle], {})).toEqual([]);
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
