import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../agentChatTypes";
import { createTranscriptState } from "./compose";
import { composeSessionTranscript } from "./session";
import { applyToolCallOperation } from "./toolCalls";

const initial = () => createTranscriptState({ sessionId: "session", namespace: "local:session", seed: 0 });
const owner: AgentMessage = {
  id: "owner",
  role: "assistant",
  content: [{ type: "toolCall", id: "call", name: "read", arguments: { path: "live" } }],
};

describe("session adaptation policy", () => {
  it("separates finality from live priority and updates partial facts beyond lexical digit boundaries", () => {
    const partial = composeSessionTranscript(initial(), [], owner, { owner: { revision: 9, isFinal: false } }, true);
    const changed: AgentMessage = {
      ...owner,
      content: [{ type: "toolCall", id: "call", name: "read", arguments: { path: "new" } }],
    };
    const next = composeSessionTranscript(partial, [], changed, { owner: { revision: 10, isFinal: false } }, true);
    const first = partial.toolCalls.get("session")?.get("call")?.owner;
    const second = next.toolCalls.get("session")?.get("call")?.owner;
    expect(first?.arguments).toEqual({ path: "live" });
    expect(second?.arguments).toEqual({ path: "new" });
    expect(second?.source.id.localeCompare(first?.source.id ?? "")).toBeGreaterThan(0);
    const snapshot: AgentMessage = { ...changed, id: "snapshot" };
    const final = composeSessionTranscript(next, [snapshot], owner, { owner: { revision: 11, isFinal: false } }, true);
    expect(final.toolCalls.get("session")?.get("call")?.owner?.source).toMatchObject({
      origin: "snapshot",
      isFinal: true,
    });
    const live = composeSessionTranscript(
      final,
      [snapshot, owner],
      null,
      { owner: { revision: 12, isFinal: true } },
      false,
    );
    expect(live.toolCalls.get("session")?.get("call")?.owner?.source.origin).toBe("live");
  });

  it("retains true orphan results, drops removed owners and exposes completion notices", () => {
    const owned = composeSessionTranscript(initial(), [owner], null, {}, false);
    const result: AgentMessage = {
      id: "result",
      role: "toolResult",
      toolCallId: "call",
      content: "failed",
      isError: true,
    };
    const orphan = composeSessionTranscript(owned, [result], null, {}, false);
    expect(orphan.rows[0]).toMatchObject({ kind: "unresolved", callId: "call" });
    expect(orphan.toolCalls.get("session")?.get("call")?.owner).toBeUndefined();
    expect(orphan.toolCalls.get("session")?.get("call")?.executionState).toBe("failed");
    const empty = composeSessionTranscript(orphan, [], null, {}, false);
    expect(empty.toolCalls.size).toBe(0);
    expect(empty.registry).toEqual([]);
  });

  it("preserves independent execution, dispatch and children only for retained calls", () => {
    const source = { id: "runtime", origin: "live", isFinal: true, priority: 3 } as const;
    const owned = composeSessionTranscript(initial(), [owner], null, {}, false);
    let toolCalls = applyToolCallOperation(owned.toolCalls, {
      type: "execution",
      sessionId: "session",
      callId: "call",
      execution: { state: "running", source },
    });
    toolCalls = applyToolCallOperation(toolCalls, {
      type: "child",
      sessionId: "session",
      callId: "call",
      child: { childSessionId: "child", event: "started", source },
    });
    const calls = new Map(toolCalls.get("session"));
    const call = calls.get("call");
    if (!call) throw new Error("Expected call");
    calls.set("call", { ...call, dispatch: { state: "accepted", source }, dispatchState: "accepted" });
    const known = { ...owned, toolCalls: new Map([["session", calls]]) };
    const retained = composeSessionTranscript(known, [owner], null, {}, false);
    expect(retained.toolCalls.get("session")?.get("call")).toMatchObject({
      executionState: "running",
      dispatchState: "accepted",
    });
    expect(retained.toolCalls.get("session")?.get("call")?.children?.get("child")?.state).toBe("running");
    const result: AgentMessage = { id: "r", role: "toolResult", toolCallId: "call", content: "ok" };
    const resultOnly = composeSessionTranscript(retained, [result], null, {}, false);
    expect(resultOnly.toolCalls.get("session")?.get("call")?.owner).toBeUndefined();
    const ownerOnly = composeSessionTranscript(resultOnly, [owner], null, {}, false);
    expect(ownerOnly.toolCalls.get("session")?.get("call")?.result).toBeUndefined();
    // Removing result-derived success does not retract the independently observed runtime start.
    expect(ownerOnly.toolCalls.get("session")?.get("call")?.executionState).toBe("running");
    expect(composeSessionTranscript(retained, [], null, {}, false).toolCalls.size).toBe(0);
  });

  it("preserves untagged runtime facts even when their source equals the selected result", () => {
    const source = { id: "shared", origin: "live", isFinal: true, priority: 3 } as const;
    const owned = composeSessionTranscript(initial(), [owner], null, {}, false);
    let toolCalls = applyToolCallOperation(owned.toolCalls, {
      type: "result",
      sessionId: "session",
      callId: "call",
      result: { content: { availability: "missing" }, source },
    });
    toolCalls = applyToolCallOperation(toolCalls, {
      type: "execution",
      sessionId: "session",
      callId: "call",
      execution: { state: "running", source },
    });
    toolCalls = applyToolCallOperation(toolCalls, {
      type: "child",
      sessionId: "session",
      callId: "call",
      child: { childSessionId: "child", event: "completed", outcome: "failed", source },
    });
    const calls = new Map(toolCalls.get("session"));
    const call = calls.get("call");
    if (!call) throw new Error("Expected call");
    calls.set("call", { ...call, dispatch: { state: "accepted", source }, dispatchState: "accepted" });
    const retained = composeSessionTranscript(
      { ...owned, toolCalls: new Map([["session", calls]]) },
      [owner],
      null,
      {},
      false,
    );
    expect(retained.toolCalls.get("session")?.get("call")).toMatchObject({
      executionState: "running",
      dispatchState: "accepted",
    });
    expect(retained.toolCalls.get("session")?.get("call")?.children?.get("child")).toMatchObject({
      state: "failed",
      isComplete: true,
    });
    expect(composeSessionTranscript(retained, [], null, {}, false).toolCalls.size).toBe(0);
  });

  it("does not merge equal snapshot text and gives local live identities stable anchors", () => {
    const messages: AgentMessage[] = [
      { id: "a", role: "user", content: "same" },
      { id: "b", role: "user", content: "same" },
    ];
    const snapshot = composeSessionTranscript(initial(), messages, null, {}, false);
    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.rows[0]).not.toEqual(snapshot.rows[1]);
    const live = composeSessionTranscript(snapshot, messages, null, { a: { revision: 1, isFinal: true } }, false);
    const next = composeSessionTranscript(live, messages, null, { a: { revision: 1, isFinal: true } }, false);
    expect(next.rows[0]).toEqual(live.rows[0]);
  });
});
