import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../agentChatTypes";
import { createTranscriptState } from "./compose";
import type { AgentMessagesInput } from "./messages";
import { composeSessionTranscript } from "./session";
import { projectSubagents } from "./subagents";
import { applyToolCallOperation, getToolCall } from "./toolCalls";
import type { TranscriptState } from "./types";

const input = (messages: AgentMessage[]): AgentMessagesInput => ({
  sessionId: "parent",
  generation: 0,
  update: 0,
  authority: "current",
  isWorking: false,
  messages: messages.map((message, index) => ({
    message,
    isStreaming: false,
    source: { id: message.id, stability: "stable", origin: "snapshot" },
    toolSource: { id: message.id, origin: "snapshot", isFinal: true, priority: index },
  })),
});
const owner = (id: string, agent = "reader"): AgentMessage => ({
  id: `owner-${id}`,
  role: "assistant",
  content: [{ type: "toolCall", id, name: "Agent", arguments: { agent } }],
});
const lifecycle = (id: string, childSessionId: string, extra: Record<string, unknown> = {}): AgentMessage => ({
  id,
  role: "custom",
  customType: "pi-subagent-child",
  display: false,
  content: "",
  details: { event: "started", agentId: `agent-${childSessionId}`, agentName: "reader", childSessionId, ...extra },
});

describe("slice A: canonical lifecycle projection", () => {
  it("keeps exact orphan identity, serial legacy order and foreground boundaries", () => {
    const projected = projectSubagents(
      input([
        owner("done"),
        {
          id: "r",
          role: "toolResult",
          toolName: "Agent",
          toolCallId: "done",
          content: "",
          details: { mode: "foreground" },
        },
        owner("one"),
        owner("two"),
        lifecycle("exact", "orphan", { parentToolCallId: "missing" }),
        lifecycle("first", "c1"),
        lifecycle("second", "c2"),
        lifecycle("third", "c3", { agentName: "other" }),
      ]),
    );
    expect([...projected.childRuns].map(([id, run]) => [id, run.parentCallId])).toEqual([
      ["orphan", "missing"],
      ["c1", "one"],
      ["c2", "two"],
      ["c3", undefined],
    ]);
    expect(projected.childOperations.map((operation) => operation.callId)).toEqual(["missing", "one", "two"]);
  });
  it.each([
    ["completed", "succeeded"],
    ["failed", "failed"],
    ["cancelled", "interrupted"],
    [undefined, "unknown"],
    ["future", "unknown"],
  ])("maps completed status %s without late-start regression", (status, state) => {
    const projected = projectSubagents(
      input([
        owner("one"),
        lifecycle("terminal", "c", { event: "completed", status, parentToolCallId: "one" }),
        lifecycle("late", "c", { parentToolCallId: "one" }),
      ]),
    );
    expect(projected.childRuns.get("c")).toMatchObject({
      state,
      isComplete: true,
      derivedFrom: "lifecycle",
      agentId: "agent-c",
    });
    expect(projected.childOperations[0]).toMatchObject({ type: "child", child: { event: "completed" } });
  });
});

const initial = () => createTranscriptState({ sessionId: "parent", namespace: "test", seed: 0 });
const compose = (messages: AgentMessage[], previous = initial()) =>
  composeSessionTranscript(previous, messages, null, {}, false);
const call = (state: TranscriptState, callId = "one") => getToolCall(state.toolCalls, { sessionId: "parent", callId });
const counts = (state: TranscriptState) =>
  state.rows.flatMap((row) =>
    row.kind === "turn"
      ? row.turn.blocks.filter((block) => block.kind === "toolGroup").map((group) => group.stateCounts)
      : [],
  );
const result = (details: Record<string, unknown>, isError = false, toolCallId = "one"): AgentMessage => ({
  id: `result-${toolCallId}`,
  role: "toolResult",
  toolCallId,
  toolName: "Agent",
  isError,
  details,
  content: "tool text",
});

describe("slice B: session child facts and presentation", () => {
  it("reconciles a retained terminal child collision into both ledgers and the group", () => {
    const previous = compose([owner("one")]);
    const runtime = {
      ...previous,
      toolCalls: applyToolCallOperation(previous.toolCalls, {
        type: "child",
        sessionId: "parent",
        callId: "one",
        child: {
          childSessionId: "c",
          event: "completed",
          outcome: "failed",
          source: { id: "runtime-failed", origin: "live", priority: 10, isFinal: true },
        },
      }),
    };
    const projected = compose([owner("one"), lifecycle("start", "c", { parentToolCallId: "one" })], runtime);
    expect(call(projected)?.children?.get("c")).toMatchObject({ state: "failed", isComplete: true });
    expect(projected.childRuns?.get("c")).toMatchObject(call(projected)?.children?.get("c") ?? {});
    expect(projected.childRuns?.get("c")).toMatchObject({ state: "failed", agentName: "reader", parentCallId: "one" });
    expect(projected.childRuns?.get("c")?.derivedFrom).toBeUndefined();
    expect(counts(projected)[0]).toMatchObject({ failed: 1, running: 0 });
  });
  it("preserves observed same-child metadata when a foreground completion wins", () => {
    const projected = compose([
      owner("one", "configured-reader"),
      lifecycle("start", "c", {
        parentToolCallId: "one",
        agentName: "observed-reader",
        title: "Inspect sources",
        summary: "Trace the failure",
      }),
      result({ mode: "foreground", sessionId: "c", status: "completed" }),
    ]);
    expect(projected.childRuns?.get("c")).toMatchObject({
      state: "succeeded",
      derivedFrom: "result",
      agentId: "agent-c",
      agentName: "observed-reader",
      title: "Inspect sources",
      summary: "Trace the failure",
    });
    expect(call(projected)?.children?.get("c")).toEqual(projected.childRuns?.get("c"));
    expect(counts(projected)[0]).toMatchObject({ succeeded: 1, running: 0 });
  });
  it("keeps accepted dispatch separate from running children and ordinary execution", () => {
    const messages = [owner("one"), result({ mode: "background", agentId: "a" })];
    const pending = compose(messages);
    expect(call(pending)).toMatchObject({ executionState: "succeeded", dispatchState: "accepted" });
    expect(counts(pending)[0]).toMatchObject({ pending: 1, succeeded: 0 });
    const running = compose([...messages, lifecycle("start", "c", { parentToolCallId: "one" })], pending);
    expect(call(running)?.children?.get("c")).toEqual(running.childRuns?.get("c"));
    expect(counts(running)[0]).toMatchObject({ running: 1, succeeded: 0 });
    const complete = compose(
      [...messages, lifecycle("end", "c", { event: "completed", parentToolCallId: "one" })],
      running,
    );
    expect(counts(complete)[0]).toMatchObject({ unknown: 1, running: 0 });
    const failed = compose([owner("one"), result({ mode: "background" }, true)]);
    expect(call(failed)?.dispatchState).toBe("failed");
    expect(counts(failed)[0]).toMatchObject({ failed: 1, pending: 0 });
  });
  it.each([
    ["failed", "failed"],
    ["cancelled", "interrupted"],
    ["completed", "succeeded"],
    [undefined, "unknown"],
  ])("uses foreground child status %s, not tool execution success", (status, state) => {
    const projected = compose([owner("one"), result({ mode: "foreground", sessionId: "c", agentId: "a", status })]);
    expect(call(projected)?.executionState).toBe("succeeded");
    expect(projected.childRuns?.get("c")).toMatchObject({
      state,
      mode: "foreground",
      agentId: "a",
      parentCallId: "one",
      derivedFrom: "result",
    });
    expect(call(projected)?.children?.get("c")).toEqual(projected.childRuns?.get("c"));
    expect(counts(projected)[0]).toMatchObject({ [state ?? "unknown"]: 1 });
  });
  it("retains exact ownerless relationships then resolves them, and clears only raw-derived children", () => {
    const metadata = lifecycle("start", "c", { parentToolCallId: "one" });
    const orphan = compose([metadata, lifecycle("unmatched", "u", { agentName: "other" })]);
    expect(orphan.childRuns?.has("u")).toBe(true);
    expect(orphan.rows).toContainEqual(expect.objectContaining({ kind: "unresolved", callId: "one" }));
    const linked = compose([owner("one"), metadata], orphan);
    expect(linked.rows.some((row) => row.kind === "unresolved")).toBe(false);
    const runtime = {
      ...linked,
      toolCalls: applyToolCallOperation(linked.toolCalls, {
        type: "child",
        sessionId: "parent",
        callId: "one",
        child: {
          childSessionId: "runtime",
          event: "started",
          source: { id: "runtime", origin: "live", priority: 10, isFinal: true },
        },
      }),
    };
    const removed = compose([owner("one")], runtime);
    expect(removed.childRuns?.size).toBe(0);
    expect([...(call(removed)?.children?.keys() ?? [])]).toEqual(["runtime"]);
  });
  it("identifies Agent only from known owner or explicit toolName and uses actual result source IDs", () => {
    const withoutName = { ...result({ mode: "background" }), toolName: undefined };
    const known = compose([owner("one"), withoutName]);
    expect(call(known)?.dispatch?.source.id).toBe(call(known)?.result?.source.id);
    expect(call(known)?.dispatchState).toBe("accepted");
    const namelessOwner: AgentMessage = {
      id: "owner-one",
      role: "assistant",
      content: [{ type: "toolCall", id: "one", name: "Agent", arguments: {} }],
    };
    expect(call(compose([namelessOwner, withoutName]))?.dispatchState).toBe("accepted");
    const foreground = compose([namelessOwner, { ...withoutName, details: { mode: "foreground", sessionId: "c" } }]);
    expect(foreground.childRuns?.get("c")).toMatchObject({ parentCallId: "one", state: "unknown" });
    expect(foreground.childRuns?.get("c")?.agentName).toBeUndefined();
    const unknown = compose([{ ...withoutName, details: { mode: "foreground", sessionId: "c" } }]);
    expect(unknown.childRuns?.size).toBe(0);
    const explicit = compose([result({ mode: "foreground", sessionId: "c", status: "failed" })]);
    expect(explicit.childRuns?.get("c")?.state).toBe("failed");
  });
  it("does not let visible completion override hidden lifecycle or count duplicate references", () => {
    const projected = compose([
      owner("one"),
      owner("one"),
      lifecycle("start", "c", { parentToolCallId: "one" }),
      {
        id: "notice",
        role: "custom",
        customType: "subagent-completion",
        display: true,
        content: "done",
        details: { version: 1, agentId: "a", agentName: "reader", sessionId: "c", status: "completed" },
      },
      { id: "ordinary", role: "assistant", content: [{ type: "toolCall", id: "read", name: "read", arguments: {} }] },
      { id: "read-result", role: "toolResult", toolCallId: "read", content: "ok" },
    ]);
    expect(projected.childRuns?.size).toBe(1);
    expect(projected.childRuns?.get("c")?.state).toBe("running");
    expect(counts(projected)).toMatchObject([{ running: 1 }, { succeeded: 1 }]);
    expect(projected.rows.filter((row) => row.kind === "completion")).toHaveLength(1);
  });
});
