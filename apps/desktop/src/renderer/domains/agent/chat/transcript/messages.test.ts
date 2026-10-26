import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../agentChatTypes";
import { composeTranscript, createTranscriptState } from "./compose";
import { type AgentMessageInput, adaptAgentMessages } from "./messages";
import { getToolCall } from "./toolCalls";

function input(message: AgentMessage, isStreaming = false): AgentMessageInput {
  return {
    message,
    source: { id: `source-${message.id}`, stability: "stable", origin: "live" },
    toolSource: { id: `fact-${message.id}`, origin: "live", isFinal: true, priority: 1 },
    isStreaming,
  };
}

function adapt(messages: readonly AgentMessageInput[], update = 0, isWorking = false) {
  return adaptAgentMessages({ sessionId: "parent", generation: 0, update, authority: "current", isWorking, messages });
}

function initial() {
  return createTranscriptState({ sessionId: "parent", namespace: "test", seed: 0 });
}

describe("message adapter slice A", () => {
  it("preserves ordered content, explicit provenance, timing and summary inputs without retaining messages", () => {
    const signature = { id: "sig", summary: [{ type: "summary_text", text: "reason" }] };
    const messages = [
      input({
        id: "u",
        role: "user",
        content: [
          { type: "text", text: "one" },
          { type: "text", text: "two" },
        ],
        timestamp: 10,
      }),
      input(
        {
          id: "a",
          role: "assistant",
          content: [
            { type: "text", text: "before" },
            { type: "thinking", thinking: "reason", thinkingSignature: signature },
            { type: "text", text: "after" },
          ],
          timestamp: 50,
          startedAtMs: 20,
          durationMs: 30,
          usage: { input: 100, output: 20 },
        },
        true,
      ),
    ];
    const assistant = messages[1];
    if (!assistant) throw new Error("Expected assistant input");
    messages[1] = { ...assistant, source: { id: "explicit-generated", stability: "generated", origin: "snapshot" } };
    const before = structuredClone(messages);
    const mapped = adapt(messages, 7, true);
    expect(mapped.diagnostics).toEqual([]);
    expect(mapped.snapshot).toEqual({
      sessionId: "parent",
      generation: 0,
      update: 7,
      authority: "current",
      isWorking: true,
      toolOperations: [],
      observations: [
        { kind: "user", source: messages[0]?.source, text: "one\ntwo", timestampMs: 10 },
        {
          kind: "assistant",
          source: messages[1]?.source,
          isStreaming: true,
          timestampMs: 50,
          startedAtMs: 20,
          durationMs: 30,
          blocks: [
            { kind: "text", text: "before" },
            { kind: "thinking", text: "reason", signature },
            { kind: "text", text: "after" },
          ],
        },
      ],
    });
    const composed = composeTranscript(initial(), mapped.snapshot);
    expect(composed.rows[1]).toMatchObject({
      kind: "turn",
      turn: {
        summary: { text: "before\nafter", thinking: [{ text: "reason", signature }], isStreaming: true },
        startedAtMs: 20,
        startTimestampMs: 10,
        workedDurationMs: null,
      },
    });
    expect(messages).toEqual(before);
    expect(JSON.stringify(composed)).not.toContain('"role"');
    expect(JSON.stringify(composed)).not.toContain('"usage"');
    const finished = adapt(
      messages.map((entry) => ({ ...entry, isStreaming: false })),
      8,
    );
    expect(composeTranscript(composed, finished.snapshot).rows[1]).toMatchObject({
      kind: "turn",
      turn: { workedDurationMs: 30 },
    });
  });

  it("keeps validated completions separate with optional navigation identity and excludes child timing", () => {
    const completion: AgentMessage = {
      id: "notice",
      role: "custom",
      customType: "subagent-completion",
      display: true,
      content: "child done",
      details: { version: 1, agentId: "child", agentName: "Worker", status: "completed" },
      startedAtMs: 900,
      durationMs: 999,
      usage: { input: 999, output: 999 },
    };
    const messages = [
      input({ id: "u", role: "user", content: "go", timestamp: 10 }),
      input({ id: "a", role: "assistant", content: "working", startedAtMs: 20, durationMs: 5 }),
      input(completion),
      input({ ...completion, id: "hidden", display: false }),
      input({ ...completion, id: "invalid", details: { ...completion.details, sessionId: " " } }),
      input({
        id: "tail",
        role: "assistant",
        content: [
          { type: "thinking", thinking: "finish", thinkingSignature: "signed" },
          { type: "text", text: "answer" },
        ],
        startedAtMs: 50,
        durationMs: 10,
      }),
    ];
    const mapped = adapt(messages);
    expect(mapped.snapshot.observations.map((observation) => observation.kind)).toEqual([
      "user",
      "assistant",
      "completion",
      "assistant",
    ]);
    const state = composeTranscript(initial(), mapped.snapshot);
    expect(state.rows[2]).toMatchObject({
      kind: "completion",
      completion: {
        agentId: "child",
        agentName: "Worker",
        text: "child done",
        outcome: "succeeded",
      },
    });
    if (state.rows[2]?.kind !== "completion") throw new Error("Expected completion");
    expect(state.rows[2].completion).not.toHaveProperty("childSessionId");
    expect(state.rows[1]).toMatchObject({ kind: "turn", turn: { timingContinues: true, workedDurationMs: null } });
    expect(state.rows[3]).toMatchObject({
      kind: "turn",
      turn: {
        workedDurationMs: 40,
        summary: { text: "answer", thinking: [{ signature: "signed" }] },
      },
    });
    for (const [status, outcome] of [
      ["completed", "succeeded"],
      ["failed", "failed"],
      ["cancelled", "interrupted"],
    ]) {
      const withSession = adapt([
        input({ ...completion, details: { ...completion.details, status, sessionId: "child-session" } }),
      ]);
      expect(withSession.snapshot.observations[0]).toMatchObject({
        kind: "completion",
        completion: {
          childSessionId: "child-session",
          agentId: "child",
          agentName: "Worker",
          outcome,
        },
      });
    }
  });
});

const parallel: AgentMessage = {
  id: "parallel",
  role: "assistant",
  content: [
    { type: "thinking", thinking: "plan", thinkingSignature: "signature" },
    { type: "toolCall", id: "a", name: "read", arguments: { path: "a", nested: { flag: true } } },
    { type: "text", text: "between" },
    { type: "toolCall", id: "b", name: "agent", arguments: { task: "work" } },
    { type: "toolCall", id: "a", name: "read", arguments: { path: "a", nested: { flag: true } } },
  ],
  startedAtMs: 20,
  durationMs: 10,
};

function call(state: ReturnType<typeof initial>, callId: string) {
  return getToolCall(state.toolCalls, { sessionId: "parent", callId });
}

describe("message adapter slice B", () => {
  it("maps parallel owners and results by call ID, resolves result-first references and never guesses dispatch", () => {
    const messages = [
      input({
        id: "early",
        role: "toolResult",
        toolCallId: "b",
        content: "Agent failed to launch",
        details: { structured: [1, 2] },
      }),
      input(parallel, true),
      input({
        id: "error",
        role: "toolResult",
        toolCallId: "a",
        content: [
          { type: "text", text: "bad" },
          { type: "text", text: "path" },
        ],
        isError: true,
      }),
      input({ id: "orphan", role: "toolResult", toolCallId: "orphan", content: "unmatched", isError: false }),
      input({ id: "missing", role: "toolResult", toolCallId: "missing", content: [] }),
    ];
    const before = structuredClone(messages);
    const mapped = adapt(messages);
    expect(mapped.snapshot.observations.map((observation) => observation.kind)).toEqual([
      "unresolved",
      "assistant",
      "unresolved",
      "unresolved",
      "unresolved",
    ]);
    expect(mapped.snapshot.observations[1]).toMatchObject({
      kind: "assistant",
      isStreaming: true,
      blocks: [
        { kind: "thinking", text: "plan", signature: "signature" },
        { kind: "tool", callId: "a" },
        { kind: "text", text: "between" },
        { kind: "tool", callId: "b" },
        { kind: "tool", callId: "a" },
      ],
    });
    expect(mapped.snapshot.toolOperations.filter((operation) => operation.type === "owner")).toEqual(
      ["a", "b", "a"].map((callId) => ({
        type: "owner",
        sessionId: "parent",
        callId,
        owner: {
          name: callId === "a" ? "read" : "agent",
          arguments: callId === "a" ? { path: "a", nested: { flag: true } } : { task: "work" },
          source: messages[1]?.toolSource,
        },
      })),
    );
    const state = composeTranscript(initial(), mapped.snapshot);
    expect(state.rows.map((row) => row.kind)).toEqual(["turn", "unresolved", "unresolved"]);
    expect(call(state, "a")).toMatchObject({
      executionState: "failed",
      result: {
        content: { availability: "available", completeness: "unknown", text: "bad\npath" },
        outcome: "failed",
      },
    });
    expect(call(state, "b")).toMatchObject({
      executionState: "succeeded",
      result: {
        content: {
          availability: "available",
          completeness: "unknown",
          text: "Agent failed to launch",
          details: { structured: [1, 2] },
        },
        outcome: "succeeded",
      },
    });
    expect(call(state, "b")?.dispatch).toBeUndefined();
    expect(call(state, "b")?.children).toBeUndefined();
    expect(call(state, "orphan")).toMatchObject({ executionState: "succeeded", result: { outcome: "succeeded" } });
    expect(call(state, "missing")?.result?.content).toEqual({ availability: "missing" });
    expect(messages).toEqual(before);
    expect(JSON.stringify([...(state.toolCalls.get("parent")?.values() ?? [])])).not.toContain('"role"');
    const resultOnly = composeTranscript(initial(), adapt(messages.slice(0, 1)).snapshot);
    expect(resultOnly.rows[0]).toMatchObject({
      kind: "unresolved",
      callId: "b",
      entity: { result: { outcome: "succeeded" } },
    });
  });

  it("honors explicit finality/priority independent of streaming, origins and duplicate order", () => {
    const low = input({ id: "low", role: "toolResult", toolCallId: "a", content: "low", isError: true });
    const high = input({ id: "high", role: "toolResult", toolCallId: "a", content: "high", isError: false }, true);
    const partial: AgentMessageInput = {
      ...low,
      toolSource: { id: "partial", origin: "snapshot", priority: 999, isFinal: false },
    };
    const final: AgentMessageInput = {
      ...high,
      toolSource: { id: "final", origin: "live", priority: -1, isFinal: true },
    };
    for (const results of [
      [partial, final, final],
      [final, partial, final],
    ]) {
      const state = composeTranscript(initial(), adapt([input(parallel), ...results]).snapshot);
      expect(call(state, "a")?.result).toMatchObject({
        source: final.toolSource,
        outcome: "succeeded",
        content: { text: "high", completeness: "unknown" },
      });
    }
    const preferred: AgentMessageInput = {
      ...partial,
      toolSource: { ...partial.toolSource, id: "priority", isFinal: true, priority: 2 },
    };
    const state = composeTranscript(initial(), adapt([input(parallel), final, preferred]).snapshot);
    expect(call(state, "a")?.result?.source).toEqual(preferred.toolSource);
    expect(call(state, "a")?.executionState).toBe("failed");
  });

  it("converges from live prefixes to the same display structure as history of the same facts", () => {
    const messages = [
      input({ id: "u", role: "user", content: "go", timestamp: 10 }),
      input(parallel),
      input({ id: "r-a", role: "toolResult", toolCallId: "a", content: "A" }),
      input({ id: "r-b", role: "toolResult", toolCallId: "b", content: "B" }),
      input({ id: "answer", role: "assistant", content: "done", startedAtMs: 50, durationMs: 10 }),
    ];
    let live = initial();
    for (let length = 2; length <= messages.length; length++) {
      live = composeTranscript(live, adapt(messages.slice(0, length), length, length < messages.length).snapshot);
    }
    const history = messages.map(
      (entry): AgentMessageInput => ({
        ...entry,
        source: { ...entry.source, origin: "snapshot" },
        toolSource: { ...entry.toolSource, origin: "snapshot" },
      }),
    );
    const restored = composeTranscript(initial(), adapt(history, messages.length).snapshot);
    expect(live.rows).toEqual(restored.rows);
    expect(call(live, "a")?.executionState).toEqual(call(restored, "a")?.executionState);
    expect(composeTranscript(live, adapt(history, messages.length + 1).snapshot).rows).toEqual(live.rows);
    const stale = adaptAgentMessages({
      sessionId: "parent",
      generation: 0,
      update: 100,
      authority: "stale",
      isWorking: false,
      messages: [],
    });
    expect(composeTranscript(live, stale.snapshot)).toBe(live);
  });

  it("reports malformed results by input index with bounded diagnostics and no invented IDs", () => {
    const malformed = Array.from({ length: 25 }, (_, index) =>
      input({
        id: `bad-${index}`,
        role: "toolResult",
        content: "retained by caller",
        toolCallId: index % 2 ? " " : undefined,
      }),
    );
    const mapped = adapt(malformed);
    expect(mapped.snapshot.toolOperations).toEqual([]);
    expect(mapped.snapshot.observations).toHaveLength(25);
    expect(mapped.snapshot.observations[0]).toMatchObject({
      kind: "unmatched",
      text: "retained by caller",
      isError: false,
    });
    expect(mapped.diagnostics).toHaveLength(20);
    expect(mapped.diagnostics[0]).toEqual({ code: "missingToolCallId", messageIndex: 0 });
    expect(mapped.diagnostics[19]).toEqual({ code: "missingToolCallId", messageIndex: 19 });
    expect(mapped.hasMoreDiagnostics).toBe(true);
    expect(adapt(malformed.slice(0, 1)).hasMoreDiagnostics).toBe(false);
    const detailsOnly = adapt([
      input({ id: "details", role: "toolResult", toolCallId: "valid", content: [], details: { value: 1 } }),
    ]);
    expect(detailsOnly.snapshot.toolOperations[0]).toMatchObject({
      type: "result",
      result: {
        content: { availability: "available", completeness: "unknown", details: { value: 1 } },
      },
    });
  });
});
