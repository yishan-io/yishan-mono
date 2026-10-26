import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../agentChatTypes";
import { composeTranscript, createTranscriptState } from "./compose";
import { type AgentMessageInput, adaptAgentMessages } from "./messages";
import { getTranscriptContextTokens, projectThinking, projectToolCard, projectTranscript } from "./presentation";
import type { SubagentRun } from "./subagents";
import { getToolCall } from "./toolCalls";
import type { ToolCallEntity, ToolCallSource } from "./toolCalls.types";
import type { TranscriptSource } from "./types";

const source: ToolCallSource = { id: "fact", origin: "live", isFinal: true, priority: 1 };
function entity(name = "read", args: Record<string, unknown> = { path: "src/a.ts" }): ToolCallEntity {
  return { sessionId: "s", callId: "c", owner: { name, arguments: args, source }, executionState: "unknown" };
}

describe("presentation slice A", () => {
  it("projects descriptors, explicit running/error and content completeness independently", () => {
    const call: ToolCallEntity = {
      ...entity(),
      executionState: "running",
      result: {
        source,
        outcome: "failed",
        content: { availability: "available", completeness: "partial", text: "failure", details: { reason: "bad" } },
      },
    };
    const before = structuredClone(call);
    expect(projectToolCard(call)).toMatchObject({
      sessionId: "s",
      callId: "c",
      toolCall: { id: "c", name: "read", arguments: { path: "src/a.ts" } },
      renderer: { kind: "read", path: "src/a.ts" },
      rendererKind: "read",
      executionState: "running",
      presentationState: "running",
      isError: true,
      hasResult: true,
      completeness: "partial",
      isPending: true,
      isLive: true,
      result: { text: "failure", details: { reason: "bad" }, isError: true },
    });
    expect(call).toEqual(before);
    expect(projectToolCard(entity())).toMatchObject({
      presentationState: "unknown",
      result: null,
      completeness: "missing",
      hasResult: false,
      isPending: true,
      isLive: false,
    });
  });

  it("validates required renderer fields and keeps malformed or unknown calls generic", () => {
    const valid = [
      ["read", { path: "a" }, { kind: "read", path: "a" }],
      ["memory_read", { path: "a" }, { kind: "memoryRead", path: "a" }],
      ["bash", { command: "ls" }, { kind: "bash", command: "ls" }],
      ["Agent", { agent: "builder", prompt: "fix" }, { kind: "agent", agent: "builder", prompt: "fix" }],
      ["edit", { path: "a" }, { kind: "diff", path: "a" }],
      ["write", { path: "a" }, { kind: "diff", path: "a" }],
      ["grep", { pattern: "x" }, { kind: "grep", pattern: "x" }],
      ["memory_search", { query: "x" }, { kind: "memorySearch", query: "x" }],
      ["web_fetch", { url: "https://example.com" }, { kind: "webFetch", urls: ["https://example.com"] }],
    ] satisfies [string, Record<string, unknown>, Record<string, unknown>][];
    for (const [name, args, renderer] of valid) {
      expect(projectToolCard(entity(name, args)).renderer).toEqual(renderer);
      for (const invalid of [
        {},
        Object.fromEntries(Object.keys(args).map((key) => [key, " "])),
        Object.fromEntries(Object.keys(args).map((key) => [key, 1])),
      ]) {
        expect(projectToolCard(entity(name, invalid)).renderer).toEqual({ kind: "generic" });
      }
    }
    expect(projectToolCard(entity("web_fetch", { pages: [{ url: "https://a" }] })).renderer).toEqual({
      kind: "webFetch",
      urls: ["https://a"],
    });
    for (const pages of [[], [{ url: " " }], [null], ["https://a"]])
      expect(projectToolCard(entity("web_fetch", { pages })).renderer.kind).toBe("generic");
    expect(projectToolCard(entity("future", {})).renderer.kind).toBe("generic");
    expect(projectToolCard(entity("ask_user", {})).renderer).toEqual({ kind: "askUser", toolName: "ask_user" });
    expect(
      projectToolCard({
        sessionId: "s",
        callId: "orphan",
        executionState: "failed",
        result: { source, toolName: "bash", content: { availability: "missing" }, outcome: "failed" },
      }),
    ).toMatchObject({ toolCall: { name: "bash", arguments: {} }, renderer: { kind: "generic" }, isError: true });
  });
});

const stable: TranscriptSource = { id: "assistant", stability: "stable", origin: "live" };
function child(state: SubagentRun["state"], isComplete: boolean): SubagentRun {
  return {
    childSessionId: "child",
    parentCallId: "c",
    agentName: "Builder",
    agentId: "real-agent",
    state,
    isComplete,
    event: isComplete ? "completed" : "started",
    source,
  };
}

describe("presentation slice B", () => {
  it("uses only canonical child/dispatch state and terminal navigation, never result prose/status", () => {
    const agent: ToolCallEntity = {
      ...entity("Agent", { agent: "builder", prompt: "fix" }),
      executionState: "succeeded",
      dispatchState: "accepted",
      result: {
        source,
        content: {
          availability: "available",
          completeness: "complete",
          text: "child /fake/path",
          details: { status: "completed", sessionId: "fake" },
        },
      },
    };
    expect(projectToolCard(agent)).toMatchObject({ agentStatus: "pending", isLive: false, isPending: true });
    expect(projectToolCard(agent).navigationTarget).toBeUndefined();
    for (const [state, complete] of [
      ["running", false],
      ["succeeded", true],
      ["failed", true],
      ["interrupted", true],
      ["unknown", true],
    ] satisfies [SubagentRun["state"], boolean][]) {
      const run = child(state, complete);
      const card = projectToolCard(agent, new Map([["child", run]]));
      expect(card.agentStatus).toBe(state);
      expect(card.isLive).toBe(!complete);
      expect(card.navigationTarget).toEqual(
        complete ? { childSessionId: "child", agentId: "real-agent", title: "Builder" } : undefined,
      );
    }
    const failed = child("failed", true);
    expect(projectToolCard({ ...agent, children: new Map([["child", failed]]) }).agentStatus).toBe("failed");
    expect(projectToolCard({ ...agent, owner: { name: "Agent", arguments: {}, source } }).agentLabel).toBe("Agent");
    expect(projectToolCard(agent, new Map([["other", { ...failed, parentCallId: "other" }]])).agentStatus).toBe(
      "pending",
    );
  });

  it("projects ordered groups with unique counts, shared cards, pending/live and safe thinking", () => {
    const state = composeTranscript(createTranscriptState({ sessionId: "s", namespace: "n", seed: 0 }), {
      sessionId: "s",
      generation: 0,
      update: 0,
      authority: "current",
      isWorking: true,
      observations: [
        {
          kind: "assistant",
          source: stable,
          isStreaming: true,
          blocks: [
            { kind: "thinking", text: "full reason", signature: { summary: [{ text: "**Plan**" }] } },
            { kind: "tool", callId: "c" },
            { kind: "tool", callId: "c" },
            { kind: "tool", callId: "b" },
          ],
        },
      ],
      toolOperations: [
        { type: "owner", sessionId: "s", callId: "c", owner: { name: "read", arguments: { path: "a" }, source } },
        { type: "execution", sessionId: "s", callId: "c", execution: { state: "running", source } },
        { type: "owner", sessionId: "s", callId: "b", owner: { name: "bash", arguments: { command: "ls" }, source } },
      ],
    });
    const row = projectTranscript(state).rows[0];
    if (row?.kind !== "turn") throw new Error("Expected turn");
    const group = row.turn.blocks[0];
    if (group?.kind !== "group") throw new Error("Expected group");
    expect(group.members.map((member) => member.kind)).toEqual(["thinking", "card", "card", "card"]);
    expect(group.members[1]).toBe(group.members[2]);
    expect(group.summaryItems).toEqual([
      { key: "read", count: 1 },
      { key: "bash", count: 1 },
    ]);
    expect(group.callCount).toBe(2);
    expect(group.pendingMembers).toEqual(group.members);
    expect(group.isLive).toBe(true);
    expect(group.members[0]).toMatchObject({ text: "full reason", summary: "Plan", hasDetails: true });
    expect(projectTranscript(state)).toEqual(projectTranscript(state));
    expect(group.id).toBe(
      state.rows[0]?.kind === "turn"
        ? state.rows[0].turn.blocks[0]?.kind === "toolGroup"
          ? state.rows[0].turn.blocks[0].id
          : ""
        : "",
    );
  });

  it("narrows unknown signatures, keeps summary-first details semantics and display-only stable keys", () => {
    const think = (signature: unknown, text = "**Plan**") =>
      projectThinking({ kind: "thinking", text, isStreaming: false }, "turn", 2, signature);
    expect(think('{"summary":[{"text":"**Plan**"},null,{"text":4}]}')).toMatchObject({
      summary: "Plan",
      hasDetails: false,
      text: "**Plan**",
    });
    for (const signature of [null, [], "bad json", { summary: "bad" }, { summary: [null, 3, {}] }])
      expect(think(signature)).toMatchObject({ summary: null, hasDetails: true });
    expect(think({ summary: [{ text: "Plan" }] }, " ").hasDetails).toBe(false);
    const first = projectThinking({ kind: "thinking", text: "a", source: stable, isStreaming: false }, "x", 0);
    expect(
      projectThinking({ kind: "thinking", text: "changed", source: stable, isStreaming: true }, "moved", 5).key,
    ).toBe(first.key);
    expect(think(undefined).key).not.toBe(
      projectThinking({ kind: "thinking", text: "a", isStreaming: false }, "turn", 3).key,
    );
  });
});

function input(message: AgentMessage): AgentMessageInput {
  return {
    message,
    isStreaming: false,
    source: { id: message.id, stability: "stable", origin: "live" },
    toolSource: { ...source, id: message.id },
  };
}
function adapt(messages: readonly AgentMessageInput[], update = 0, isWorking = false) {
  return adaptAgentMessages({ sessionId: "parent", generation: 0, update, authority: "current", isWorking, messages });
}
function initial() {
  return createTranscriptState({ sessionId: "parent", namespace: "test", seed: 0 });
}
function call(state: ReturnType<typeof initial>, callId: string) {
  return getToolCall(state.toolCalls, { sessionId: "parent", callId });
}

describe("presentation row parity slice C", () => {
  it("keeps missing-ID body/provenance without fake calls, timestamp, working scan and parent timing", () => {
    const messages = [
      input({ id: "u", role: "user", content: "go", timestamp: 10 }),
      input({ id: "a", role: "assistant", content: "first", startedAtMs: 20, durationMs: 5 }),
      input({
        id: "bad",
        role: "toolResult",
        content: "lost body",
        toolName: "bash",
        isError: true,
        details: { reason: "broken" },
      }),
    ];
    const mapped = adapt(messages, 0, true);
    expect(mapped.snapshot.observations[2]).toEqual({
      kind: "unmatched",
      source: messages[2]?.source,
      text: "lost body",
      toolName: "bash",
      isError: true,
      details: { reason: "broken" },
    });
    const state = composeTranscript(initial(), mapped.snapshot);
    const display = projectTranscript(state, { contextTokens: 123 });
    expect(display.contextTokens).toBe(123);
    expect(display.rows[0]).toMatchObject({ kind: "user", timestampMs: 10 });
    expect(display.rows[1]).toMatchObject({
      kind: "turn",
      turn: { isWorking: true, workedDurationMs: null, summary: { text: "first" } },
    });
    expect(display.rows[2]).toMatchObject({ kind: "unmatched", text: "lost body", toolName: "bash", isError: true });
    expect(state.toolCalls.size).toBe(0);
    const updated = composeTranscript(
      state,
      adapt(
        messages.map((entry) =>
          entry.message.id === "bad" ? { ...entry, message: { ...entry.message, content: "updated" } } : entry,
        ),
        1,
      ).snapshot,
    );
    expect(updated.rows[2]?.kind === "unmatched" && updated.rows[2].id).toBe(
      state.rows[2]?.kind === "unmatched" && state.rows[2].id,
    );
    expect(composeTranscript(updated, adapt(messages, 1).snapshot)).toBe(updated);
    const tail = input({ id: "tail", role: "assistant", content: "done", startedAtMs: 50, durationMs: 10 });
    const finished = composeTranscript(state, adapt([...messages, tail], 2).snapshot);
    expect(finished.rows[1]).toMatchObject({ kind: "turn", turn: { timingContinues: true, workedDurationMs: null } });
    expect(finished.rows[3]).toMatchObject({
      kind: "turn",
      turn: { startedAtMs: 20, workedDurationMs: 40, summary: { text: "done" } },
    });
    const generated = messages.map(
      (entry): AgentMessageInput => ({ ...entry, source: { ...entry.source, stability: "generated" } }),
    );
    const first = composeTranscript(initial(), adapt(generated).snapshot);
    const second = composeTranscript(first, adapt(generated, 1).snapshot);
    expect(second.rows[2]?.kind === "unmatched" && second.rows[2].id).not.toBe(
      first.rows[2]?.kind === "unmatched" && first.rows[2].id,
    );
    expect(
      composeTranscript(initial(), adapt([input({ id: "u", role: "user", content: "no time" })]).snapshot).rows[0],
    ).not.toHaveProperty("timestampMs");
  });

  it("filters only empty error assistants without stealing summary, preserving actual content and visible completions", () => {
    const error: AgentMessage = {
      id: "err",
      role: "assistant",
      stopReason: "error",
      errorMessage: "failed",
      content: [],
    };
    for (const content of [[], " ", [{ type: "thinking", thinking: " " }]] satisfies AgentMessage["content"][]) {
      const state = composeTranscript(
        initial(),
        adapt([input({ id: "answer", role: "assistant", content: "answer" }), input({ ...error, content })]).snapshot,
      );
      expect(projectTranscript(state).rows).toMatchObject([{ kind: "turn", turn: { summary: { text: "answer" } } }]);
      expect(adapt([input({ ...error, content })]).snapshot.observations).toEqual([]);
    }
    for (const content of [
      "body",
      [{ type: "thinking", thinking: "reason" }],
      [{ type: "toolCall", id: "real", name: "read", arguments: { path: "a" } }],
    ] satisfies AgentMessage["content"][])
      expect(adapt([input({ ...error, content })]).snapshot.observations).toHaveLength(1);
    const notice: AgentMessage = {
      id: "notice",
      role: "custom",
      customType: "subagent-completion",
      display: true,
      content: "child failed",
      details: { version: 1, agentId: "agent", agentName: "Builder", sessionId: "child", status: "failed" },
    };
    const state = composeTranscript(
      initial(),
      adapt([
        input(notice),
        input({ ...notice, id: "hidden", display: false }),
        input({ id: "orphan", role: "toolResult", toolCallId: "ownerless", toolName: "read", content: "body" }),
        input({ id: "unnamed", role: "toolResult", toolCallId: "unnamed", content: "body" }),
        input({ id: "no-id-or-name", role: "toolResult", content: "still visible" }),
      ]).snapshot,
    );
    const rows = projectTranscript(state).rows;
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      kind: "completion",
      completion: { text: "child failed", childSessionId: "child", outcome: "failed" },
    });
    expect(rows[1]).toMatchObject({
      kind: "unresolved",
      card: { toolCall: { name: "read" }, result: { text: "body" } },
    });
    expect(rows[2]).toMatchObject({ kind: "unresolved", card: { toolCall: { name: "tool" } } });
    expect(rows[3]).toMatchObject({ kind: "unmatched", toolName: "tool", text: "still visible" });
    expect(call(state, "unnamed")?.result).not.toHaveProperty("toolName");
    expect(JSON.stringify(rows)).not.toMatch(/"role"|"mergedToolResults"|"entity"/);
  });
});

describe("card pending compatibility", () => {
  it("keeps unknown owners pending without claiming live, but excludes completed unknown children", () => {
    expect(projectToolCard(entity())).toMatchObject({ isPending: true, isLive: false });
    expect(projectToolCard({ sessionId: "s", callId: "c", executionState: "unknown" }).isPending).toBe(false);
    const agent = entity("Agent", { agent: "builder", prompt: "fix" });
    expect(projectToolCard({ ...agent, children: new Map([["child", child("unknown", true)]]) })).toMatchObject({
      isPending: false,
      isLive: false,
      agentStatus: "unknown",
      agentStatusLabel: "unknown",
    });
  });
});

describe("context usage metadata", () => {
  it("uses only the last committed usage and accepts zero without looking back", () => {
    expect(getTranscriptContextTokens([])).toBeUndefined();
    expect(getTranscriptContextTokens([{ usage: { total: 10 } }, {}])).toBe(10);
    expect(getTranscriptContextTokens([{ usage: { total: 10 } }, { usage: {} }])).toBeUndefined();
    expect(getTranscriptContextTokens([{ usage: { total: 10 } }, { usage: { totalTokens: 0, total: 5 } }])).toBe(0);
    expect(getTranscriptContextTokens([{ usage: { totalTokens: 4, total: 5 } }])).toBe(4);
    for (const total of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(getTranscriptContextTokens([{ usage: { total } }])).toBeUndefined();
    }
  });
});
