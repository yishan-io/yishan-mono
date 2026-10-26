import { describe, expect, it } from "vitest";
import {
  MAX_TOOL_CALL_DIAGNOSTIC_SOURCES,
  applyToolCallOperation,
  createToolCallsState,
  getToolCall,
} from "./toolCalls";
import type { ToolCallOperation, ToolCallsState } from "./toolCalls.types";

const identity = { sessionId: "session", callId: "call" };
const source = { id: "source", origin: "snapshot", isFinal: true, priority: 1 } as const;
const owner: ToolCallOperation = {
  ...identity,
  type: "owner",
  owner: { name: "read", arguments: { path: "a.ts" }, source },
};
const result: ToolCallOperation = {
  ...identity,
  type: "result",
  result: { content: { availability: "available", completeness: "complete", text: "contents" }, source },
};

function apply(...operations: ToolCallOperation[]): ToolCallsState {
  return operations.reduce(applyToolCallOperation, createToolCallsState());
}

function freezeDeep(subject: unknown): void {
  if (typeof subject !== "object" || subject === null) return;
  for (const child of Object.values(subject)) freezeDeep(child);
  Object.freeze(subject);
}

describe("A: exact owner/result association", () => {
  it("keeps result-first facts and merges the owner into the same identity", () => {
    const orphan = apply(result);
    expect(getToolCall(orphan, identity)).toEqual({
      ...identity,
      executionState: "unknown",
      dispatchState: "unknown",
      result: result.result,
    });
    const linked = applyToolCallOperation(orphan, owner);
    expect(getToolCall(linked, identity)).toEqual({
      ...identity,
      executionState: "unknown",
      dispatchState: "unknown",
      hasObservedOwner: true,
      owner: owner.owner,
      result: result.result,
    });
    expect(apply(owner, result)).toEqual(linked);
    expect(applyToolCallOperation(linked, owner)).toEqual(linked);
    expect(applyToolCallOperation(linked, result)).toEqual(linked);
  });

  it("isolates parallel calls, sessions, delimiter collisions and prototype-like keys", () => {
    const pairs = [
      identity,
      { ...identity, callId: "parallel" },
      { ...identity, sessionId: "other" },
      { sessionId: "a:b", callId: "c" },
      { sessionId: "a", callId: "b:c" },
      { sessionId: "__proto__", callId: "constructor" },
    ];
    const state = apply(...pairs.map((pair) => ({ ...owner, ...pair })), result);
    for (const pair of pairs) {
      expect(getToolCall(state, pair)?.owner).toEqual(owner.owner);
      expect(getToolCall(state, pair)?.result).toEqual(pair === identity ? result.result : undefined);
    }
    expect(getToolCall(state, { ...identity, callId: "absent" })).toBeUndefined();
  });

  it("does not mutate frozen inputs or prior states", () => {
    freezeDeep(owner);
    freezeDeep(result);
    const empty = createToolCallsState();
    const owned = applyToolCallOperation(empty, owner);
    const before = getToolCall(owned, identity);
    freezeDeep(before);
    const completed = applyToolCallOperation(owned, result);
    expect(empty.size).toBe(0);
    expect(getToolCall(owned, identity)).toEqual({
      ...identity,
      executionState: "unknown",
      hasObservedOwner: true,
      owner: owner.owner,
    });
    expect(getToolCall(completed, identity)?.result).toEqual(result.result);
    expect(getToolCall(owned, identity)).toBe(before);
  });
});

function execution(
  state: "unknown" | "pending" | "running" | "succeeded" | "failed" | "interrupted",
  priority = 1,
): Extract<ToolCallOperation, { type: "execution" }> {
  return { ...identity, type: "execution", execution: { state, source: { ...source, priority } } };
}

describe("B: explicit execution and final authority", () => {
  it("never infers running or success from snapshot owners or result content", () => {
    expect(getToolCall(apply(owner), identity)?.executionState).toBe("unknown");
    expect(getToolCall(apply(owner, result), identity)?.executionState).toBe("unknown");
    expect(getToolCall(apply(execution("pending")), identity)?.executionState).toBe("pending");
    expect(getToolCall(apply(execution("pending"), execution("running", 2)), identity)?.executionState).toBe("running");
  });

  it.each(["succeeded", "failed", "interrupted"] as const)("preserves terminal %s despite late starts", (outcome) => {
    const terminal = execution(outcome);
    expect(getToolCall(apply(terminal, execution("running", 999)), identity)?.executionState).toBe(outcome);
    expect(getToolCall(apply(execution("running", 999), terminal), identity)?.executionState).toBe(outcome);
    const completed: ToolCallOperation = { ...result, result: { ...result.result, outcome } };
    expect(getToolCall(apply(completed, execution("pending", 999)), identity)?.executionState).toBe(outcome);
  });

  it.each(["succeeded", "failed", "interrupted"] as const)(
    "retains %s evidence across content-only results while allowing authoritative corrections",
    (outcome) => {
      const terminal: ToolCallOperation = { ...result, result: { ...result.result, outcome } };
      const contentOnly: ToolCallOperation = {
        ...result,
        result: { ...result.result, source: { ...source, id: "content", priority: 2 } },
      };
      const correction: ToolCallOperation = {
        ...result,
        result: {
          ...result.result,
          outcome: outcome === "failed" ? "succeeded" : "failed",
          source: { ...source, id: "correction", priority: 3 },
        },
      };
      for (const initial of [[], [execution("running", 100)]]) {
        for (const facts of [
          [terminal, contentOnly],
          [contentOnly, terminal],
        ]) {
          const retained = apply(...initial, ...facts);
          expect(getToolCall(retained, identity)).toMatchObject({
            executionState: outcome,
            result: contentOnly.result,
          });
          const updated = applyToolCallOperation(retained, correction);
          expect(getToolCall(updated, identity)?.executionState).toBe(correction.result.outcome);
          expect(getToolCall(retained, identity)?.executionState).toBe(outcome);
          expect(getToolCall(applyToolCallOperation(updated, terminal), identity)?.executionState).toBe(
            correction.result.outcome,
          );
        }
      }
    },
  );

  it("keeps one independent runtime fact separate from result selection in either order", () => {
    const runtime = execution("failed");
    const failed: ToolCallOperation = {
      ...result,
      result: { ...result.result, outcome: "failed", source: { ...source, priority: 2 } },
    };
    const contentOnly: ToolCallOperation = {
      ...result,
      result: { ...result.result, source: { ...source, priority: 10 } },
    };
    const correction: ToolCallOperation = {
      ...failed,
      result: { ...failed.result, outcome: "succeeded", source: { ...source, priority: 3 } },
    };
    for (const facts of [
      [runtime, failed],
      [failed, runtime],
    ]) {
      const retained = apply(...facts, contentOnly);
      expect(getToolCall(retained, identity)).toMatchObject({
        runtimeExecution: runtime.execution,
        execution: { state: "failed", derivedFrom: "result", source: failed.result.source },
        result: contentOnly.result,
      });
      const corrected = applyToolCallOperation(retained, correction);
      expect(getToolCall(corrected, identity)).toMatchObject({
        runtimeExecution: runtime.execution,
        execution: { state: "succeeded", derivedFrom: "result" },
        result: contentOnly.result,
      });
      const runtimeCorrection = execution("interrupted", 4);
      const updated = applyToolCallOperation(corrected, runtimeCorrection);
      expect(getToolCall(updated, identity)).toMatchObject({
        runtimeExecution: runtimeCorrection.execution,
        executionState: "interrupted",
      });
      expect(getToolCall(applyToolCallOperation(updated, execution("running", 999)), identity)).toEqual(
        getToolCall(updated, identity),
      );
    }
  });

  it("updates partial arguments to final, rejecting stale partial even at higher priority", () => {
    const partial: ToolCallOperation = {
      ...owner,
      owner: { ...owner.owner, arguments: { path: "a" }, source: { ...source, isFinal: false, priority: 100 } },
    };
    const partialUpdate: ToolCallOperation = {
      ...partial,
      owner: { ...partial.owner, arguments: { path: "a." }, source: { ...partial.owner.source, priority: 101 } },
    };
    expect(getToolCall(apply(partial, partialUpdate), identity)?.owner?.arguments).toEqual({ path: "a." });
    expect(getToolCall(apply(partial, owner, partialUpdate), identity)?.owner).toEqual(owner.owner);
    expect(getToolCall(apply(owner, partial), identity)?.owner).toEqual(owner.owner);
  });

  it("keeps explicit success with missing or partial content, and complete content with explicit failure", () => {
    const missing: ToolCallOperation = {
      ...result,
      result: { ...result.result, outcome: "succeeded", content: { availability: "missing" } },
    };
    const partial: ToolCallOperation = {
      ...result,
      result: {
        ...result.result,
        outcome: "succeeded",
        content: { availability: "available", completeness: "partial", text: "cut" },
      },
    };
    for (const operation of [missing, partial]) {
      expect(getToolCall(apply(operation), identity)).toMatchObject({
        executionState: "succeeded",
        result: operation.result,
      });
    }
    const failed: ToolCallOperation = { ...result, result: { ...result.result, outcome: "failed" } };
    expect(getToolCall(apply(failed), identity)).toMatchObject({ executionState: "failed", result: failed.result });
    expect(getToolCall(apply(execution("running"), result), identity)?.executionState).toBe("running");
  });
});

function child(
  event: "started" | "completed",
  outcome?: "succeeded" | "failed" | "interrupted",
  childSessionId = "child",
): ToolCallOperation {
  return { ...identity, type: "child", child: { childSessionId, event, outcome, source } };
}

describe("C: dispatch, children and competing results", () => {
  const accepted: ToolCallOperation = {
    ...result,
    result: { ...result.result, outcome: "succeeded", dispatch: "accepted" },
  };

  it("does not confuse background acceptance or dispatch failure with child completion", () => {
    const queued = apply(accepted);
    expect(getToolCall(queued, identity)?.dispatchState).toBe("accepted");
    expect(getToolCall(queued, identity)?.children?.size ?? 0).toBe(0);
    const running = apply(accepted, child("started"));
    expect(getToolCall(running, identity)).toMatchObject({ dispatchState: "accepted", executionState: "succeeded" });
    expect(getToolCall(running, identity)?.children?.get("child")).toMatchObject({
      state: "running",
      isComplete: false,
    });
    const failed: ToolCallOperation = { ...accepted, result: { ...accepted.result, outcome: "failed" } };
    expect(getToolCall(apply(failed), identity)?.dispatchState).toBe("failed");
    const rejected: ToolCallOperation = { ...result, result: { ...result.result, dispatch: "failed" } };
    expect(getToolCall(apply(rejected), identity)?.dispatchState).toBe("failed");
    expect(getToolCall(apply(result), identity)?.dispatchState).toBe("unknown");
  });

  it.each(["accepted", "failed", "interrupted", "rejected"] as const)(
    "retains %s dispatch evidence independently of richer content in either order",
    (evidence) => {
      const dispatchFact: ToolCallOperation = {
        ...result,
        result: {
          ...result.result,
          ...(evidence === "accepted"
            ? { dispatch: "accepted", outcome: "succeeded" }
            : evidence === "rejected"
              ? { dispatch: "failed" }
              : { outcome: evidence }),
        },
      };
      const contentOnly: ToolCallOperation = {
        ...result,
        result: {
          content: { availability: "available", completeness: "complete", text: "richer content" },
          source: { ...source, id: "content", priority: 10 },
        },
      };
      for (const facts of [
        [dispatchFact, contentOnly],
        [contentOnly, dispatchFact],
      ]) {
        const state = apply(child("started"), ...facts);
        expect(getToolCall(state, identity)).toMatchObject({
          dispatchState: evidence === "accepted" ? "accepted" : "failed",
          executionState: dispatchFact.result.outcome ?? "unknown",
          result: contentOnly.result,
        });
        expect(getToolCall(state, identity)?.children?.get("child")?.state).toBe("running");
      }
    },
  );

  it.each([0, 2])("resolves explicit dispatch corrections by authority, not arrival (priority %s)", (priority) => {
    const failure: ToolCallOperation = {
      ...result,
      result: { ...result.result, dispatch: "failed", source: { ...source, id: "failure", priority } },
    };
    const contentOnly: ToolCallOperation = {
      ...result,
      result: { ...result.result, source: { ...source, id: "content", priority: 10 } },
    };
    for (const facts of [
      [accepted, failure, contentOnly],
      [contentOnly, failure, accepted],
    ]) {
      expect(getToolCall(apply(...facts), identity)).toMatchObject({
        dispatchState: priority > source.priority ? "failed" : "accepted",
        executionState: "succeeded",
        result: contentOnly.result,
      });
    }
  });

  it.each([undefined, "succeeded", "failed", "interrupted"] as const)(
    "keeps completion outcome %s without inferring success or accepting late starts",
    (outcome) => {
      const completed = child("completed", outcome);
      for (const state of [apply(completed, child("started")), apply(child("started"), completed)]) {
        expect(getToolCall(state, identity)?.children?.get("child")).toMatchObject({
          state: outcome ?? "unknown",
          isComplete: true,
        });
        expect(getToolCall(state, identity)?.executionState).toBe("unknown");
      }
    },
  );

  it("associates exact children before owner arrival and isolates parallel child sessions", () => {
    const orphan = apply(child("completed", "failed"), child("started", undefined, "parallel"));
    const linked = applyToolCallOperation(orphan, owner);
    expect(getToolCall(linked, identity)?.children?.get("child")?.state).toBe("failed");
    expect(getToolCall(linked, identity)?.children?.get("parallel")?.state).toBe("running");
    expect(getToolCall(orphan, identity)?.owner).toBeUndefined();
    expect(getToolCall(linked, { ...identity, sessionId: "other" })).toBeUndefined();
    expect(applyToolCallOperation(linked, child("completed", "failed"))).toEqual(linked);
  });

  it("selects contradictory results by finality, priority and source ID, never arrival order", () => {
    const stale: ToolCallOperation = {
      ...result,
      result: {
        ...result.result,
        outcome: "failed",
        source: { ...source, id: "stale", isFinal: false, priority: 999 },
      },
    };
    const lower: ToolCallOperation = {
      ...result,
      result: { ...result.result, outcome: "failed", source: { ...source, id: "lower", priority: 0 } },
    };
    const success: ToolCallOperation = {
      ...result,
      result: { ...result.result, outcome: "succeeded", source: { ...source, id: "a" } },
    };
    const failure: ToolCallOperation = {
      ...result,
      result: { ...result.result, outcome: "failed", source: { ...source, id: "z" } },
    };
    const forward = apply(stale, lower, success, failure);
    const backward = apply(failure, success, lower, stale);
    expect(forward).toEqual(backward);
    expect(getToolCall(forward, identity)).toMatchObject({ result: failure.result, executionState: "failed" });
    expect(getToolCall(forward, identity)?.diagnostics).toEqual([
      {
        code: "competingResults",
        sourceIds: ["a", "lower", "stale", "z"],
        hasMoreSources: false,
      },
    ]);
    expect(applyToolCallOperation(forward, failure)).toEqual(forward);
    expect(getToolCall(apply(result, result), identity)?.diagnostics).toBeUndefined();
  });

  it("bounds diagnostic provenance under many competing results, without retaining their payloads", () => {
    const operations = Array.from(
      { length: 50 },
      (_, index): ToolCallOperation => ({
        ...result,
        result: { ...result.result, source: { ...source, id: `source-${index.toString().padStart(2, "0")}` } },
      }),
    );
    const state = apply(...operations);
    expect(state).toEqual(apply(...[...operations].reverse()));
    const call = getToolCall(state, identity);
    expect(call?.diagnostics).toHaveLength(1);
    expect(call?.diagnostics?.[0]?.sourceIds).toHaveLength(MAX_TOOL_CALL_DIAGNOSTIC_SOURCES);
    expect(call?.diagnostics?.[0]?.hasMoreSources).toBe(true);
    expect(call?.result?.source.id).toBe("source-49");
  });
});
