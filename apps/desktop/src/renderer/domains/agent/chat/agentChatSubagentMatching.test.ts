import { describe, expect, it } from "vitest";
import { matchLifecycleRunsToToolCalls } from "./agentChatSubagentMatching";
import { deriveRunningSubagents, resolveAgentToolCallLifecycleStates } from "./agentChatSubagents";
import type { AgentMessage } from "./agentChatTypes";

describe("matchLifecycleRunsToToolCalls", () => {
  it("reserves exact parents before legacy pairing and retains caller metadata", () => {
    const legacy = { agentName: "builder", sourceIndex: 2, usage: { tokens: 42 } };
    const exact = { agentName: "builder", sourceIndex: 3, parentToolCallId: "call-1", usage: { tokens: 99 } };
    const matches = matchLifecycleRunsToToolCalls(
      new Map([
        ["legacy", legacy],
        ["exact", exact],
      ]),
      [
        { rowId: "call-1", agentName: "builder" },
        { rowId: "call-2", agentName: "builder" },
      ],
      new Map(),
    );

    expect(matches.get("call-1")).toBe(exact);
    expect(matches.get("call-2")).toBe(legacy);
    expect(matches.get("call-2")?.usage.tokens).toBe(42);
  });

  it("consumes same-agent legacy calls once in source order without guessing from prompts", () => {
    const first = { agentName: "builder", sourceIndex: 2, promptSummary: "different" };
    const second = { agentName: "builder", sourceIndex: 3, promptSummary: "same" };
    const unmatched = { agentName: "reviewer", sourceIndex: 4, promptSummary: "same" };
    const runs = new Map([
      ["first", first],
      ["second", second],
      ["unmatched", unmatched],
    ]);
    const matches = matchLifecycleRunsToToolCalls(
      runs,
      [
        { rowId: "call-1", agentName: "builder", promptSummary: "same" },
        { rowId: "call-2", agentName: "builder", promptSummary: "different" },
      ],
      new Map(),
    );

    expect([...matches.entries()]).toEqual([
      ["call-1", first],
      ["call-2", second],
    ]);
    expect(runs.get("unmatched")).toBe(unmatched);
  });

  it("keeps the strict foreground result source-index boundary", () => {
    const run = { agentName: "builder", sourceIndex: 5 };
    const matches = matchLifecycleRunsToToolCalls(
      new Map([["run", run]]),
      [
        { rowId: "before", agentName: "builder" },
        { rowId: "equal", agentName: "builder" },
        { rowId: "after", agentName: "builder" },
      ],
      new Map([
        ["before", 4],
        ["equal", 5],
        ["after", 6],
      ]),
    );

    expect([...matches.entries()]).toEqual([["after", run]]);
  });

  it("preserves missing exact parents without falling back to another call", () => {
    const exact = { agentName: "builder", sourceIndex: 2, parentToolCallId: "missing" };
    const legacy = { agentName: "builder", sourceIndex: 3 };
    const matches = matchLifecycleRunsToToolCalls(
      new Map([
        ["exact", exact],
        ["legacy", legacy],
      ]),
      [{ rowId: "available", agentName: "builder" }],
      new Map(),
    );

    expect(matches.get("missing")).toBe(exact);
    expect(matches.get("available")).toBe(legacy);
  });
});

describe("background dispatch compatibility", () => {
  function createMessages(isError: boolean): AgentMessage[] {
    return [
      {
        id: "assistant",
        role: "assistant",
        content: [{ type: "toolCall", id: "call", name: "Agent", arguments: { agent: "builder", prompt: "Build it" } }],
      },
      {
        id: "dispatch",
        role: "toolResult",
        toolCallId: "call",
        toolName: "Agent",
        content: "dispatch result",
        details: { mode: "background" },
        isError,
      },
    ];
  }

  it("removes a failed background dispatch from active rows instead of leaving it queued", () => {
    const messages = createMessages(true);
    expect(deriveRunningSubagents(messages)).toEqual([]);
    expect(resolveAgentToolCallLifecycleStates(messages).get("call")).toBe("completed");
  });

  it("keeps a successful background dispatch queued until child lifecycle arrives", () => {
    const messages = createMessages(false);
    expect(deriveRunningSubagents(messages)).toMatchObject([{ rowId: "call", state: "queued" }]);
    expect(resolveAgentToolCallLifecycleStates(messages).get("call")).toBe("queued");
  });

  it.each([false, true])("does not complete a started child from dispatch result (isError=%s)", (isError) => {
    const messages = createMessages(isError);
    messages.splice(1, 0, {
      id: "started",
      role: "custom",
      customType: "pi-subagent-child",
      content: "",
      details: {
        event: "started",
        agentId: "agent",
        agentName: "builder",
        childSessionId: "child",
        parentToolCallId: "call",
      },
    });
    expect(deriveRunningSubagents(messages)).toMatchObject([{ rowId: "child", state: "running" }]);
    expect(resolveAgentToolCallLifecycleStates(messages).get("call")).toBe("running");
  });
});
