import { describe, expect, it } from "vitest";
import { composeTranscript, createTranscriptState, getLiveElapsedMs } from "./compose";
import type { AssistantObservation, TranscriptObservation, TranscriptSnapshot, TranscriptState } from "./types";

const source = (id: string) => ({ id, stability: "stable", origin: "snapshot" }) as const;
const assistant = (
  id: string,
  blocks: AssistantObservation["blocks"],
  timing: Partial<AssistantObservation> = {},
): AssistantObservation => ({
  kind: "assistant",
  source: source(id),
  blocks,
  isStreaming: false,
  ...timing,
});
const snapshot = (
  observations: readonly TranscriptObservation[],
  overrides: Partial<TranscriptSnapshot> = {},
): TranscriptSnapshot => ({
  sessionId: "s",
  generation: 0,
  update: 0,
  authority: "current",
  observations,
  toolOperations: [],
  isWorking: false,
  ...overrides,
});
const initial = () => createTranscriptState({ sessionId: "s", namespace: "test", seed: 0 });
const turns = (state: TranscriptState) => state.rows.flatMap((row) => (row.kind === "turn" ? [row.turn] : []));
const user: TranscriptObservation = { kind: "user", source: source("u"), text: "prompt", timestampMs: 1000 };
const notice: TranscriptObservation = {
  kind: "completion",
  source: source("notice"),
  completion: { childSessionId: "child", text: "done", outcome: "unknown" },
};

describe("structure composition", () => {
  it("segments completion content but preserves logical-parent timing including gaps", () => {
    const observations = [
      user,
      assistant("a", [{ kind: "text", text: "Before" }], { startedAtMs: 1000, durationMs: 4000 }),
      notice,
      assistant("b", [{ kind: "text", text: "After" }], { startedAtMs: 10000, durationMs: 2000 }),
    ];
    const finished = composeTranscript(initial(), snapshot(observations));
    expect(finished.rows.map((row) => row.kind)).toEqual(["user", "turn", "completion", "turn"]);
    expect(turns(finished).map((turn) => turn.summary?.text)).toEqual(["Before", "After"]);
    expect(turns(finished).map((turn) => turn.workedDurationMs)).toEqual([null, 11000]);
    const live = composeTranscript(initial(), snapshot([...observations, notice], { isWorking: true }));
    expect(turns(live).map((turn) => turn.isWorking)).toEqual([false, true]);
    const liveTail = turns(live)[1];
    if (!liveTail) throw new Error("expected live tail");
    expect(getLiveElapsedMs(liveTail, 12000)).toBe(11000);
    expect(turns(live).map((turn) => turn.workedDurationMs)).toEqual([null, null]);
  });

  it("uses history and partial timing fallbacks and never revives a turn across a user", () => {
    const history = composeTranscript(
      initial(),
      snapshot([user, assistant("a", [], { timestampMs: 5000 }), notice, assistant("b", [], { timestampMs: 12000 })]),
    );
    expect(turns(history).map((turn) => turn.workedDurationMs)).toEqual([null, 11000]);
    const partial = composeTranscript(
      initial(),
      snapshot([
        user,
        assistant("a", [], { startedAtMs: 1000, durationMs: 4000 }),
        assistant("b", [], { timestampMs: 12000 }),
      ]),
    );
    expect(turns(partial)[0]?.workedDurationMs).toBe(4000);
    const nextUser = composeTranscript(initial(), snapshot([assistant("a", []), user, notice], { isWorking: true }));
    expect(turns(nextUser)[0]?.isWorking).toBe(false);
    expect(composeTranscript(initial(), snapshot([notice], { isWorking: true })).rows.map((row) => row.kind)).toEqual([
      "completion",
    ]);
  });
});

const factSource = { id: "fact", origin: "snapshot", isFinal: true, priority: 1 } as const;
const owner = (callId: string) =>
  ({ type: "owner", sessionId: "s", callId, owner: { name: "read", arguments: {}, source: factSource } }) as const;
const resultOp = (callId: string) =>
  ({
    type: "result",
    sessionId: "s",
    callId,
    result: { content: { availability: "missing" }, outcome: "succeeded", source: factSource },
  }) as const;

describe("association composition", () => {
  it("preserves result-first facts, resolves orphans, handles parallel duplicate operations, and derives only explicit states", () => {
    const orphan: TranscriptObservation = { kind: "unresolved", source: source("orphan"), callId: "one" };
    const first = composeTranscript(initial(), snapshot([orphan], { toolOperations: [resultOp("one")] }));
    expect(first.rows[0]).toMatchObject({ kind: "unresolved", entity: { executionState: "succeeded" } });
    const observations = [
      orphan,
      assistant("a", [
        { kind: "thinking", text: "plan" },
        { kind: "tool", callId: "one" },
        { kind: "tool", callId: "two" },
      ]),
    ];
    const next = composeTranscript(
      first,
      snapshot(observations, { update: 1, toolOperations: [owner("two"), owner("one"), owner("one")] }),
    );
    expect(next.rows.map((row) => row.kind)).toEqual(["turn"]);
    expect(turns(next)[0]?.blocks[0]).toMatchObject({
      kind: "toolGroup",
      callCount: 2,
      stateCounts: { succeeded: 1, unknown: 1, running: 0 },
    });
    const history = composeTranscript(
      initial(),
      snapshot(observations, { toolOperations: [owner("one"), resultOp("one"), owner("two")] }),
    );
    const project = (state: TranscriptState) =>
      turns(state).map((turn) => ({
        blocks: turn.blocks.map((block) => (block.kind === "toolGroup" ? { ...block, id: "ignored" } : block)),
        summary: turn.summary,
        workedDurationMs: turn.workedDurationMs,
      }));
    expect(project(next)).toEqual(project(history));
    expect(next.toolCalls.get("s")?.get("one")).toEqual(history.toolCalls.get("s")?.get("one"));
  });

  it.each([false, true])("retains dispatch evidence across incremental snapshots (reverse: %s)", (isReverse) => {
    const accepted = {
      ...resultOp("agent"),
      result: { ...resultOp("agent").result, dispatch: "accepted" },
    } as const;
    const contentOnly = {
      ...resultOp("agent"),
      result: {
        content: { availability: "available", completeness: "complete", text: "richer content" },
        source: { ...factSource, id: "content", priority: 2 },
      },
    } as const;
    const facts = isReverse ? ([contentOnly, accepted] as const) : ([accepted, contentOnly] as const);
    const observations = [assistant("a", [{ kind: "tool", callId: "agent" }])];
    const first = composeTranscript(initial(), snapshot(observations, { toolOperations: [facts[0]] }));
    const next = composeTranscript(first, snapshot(observations, { update: 1, toolOperations: [facts[1]] }));
    const history = composeTranscript(initial(), snapshot(observations, { toolOperations: facts }));
    const entity = next.toolCalls.get("s")?.get("agent");
    expect(entity).toMatchObject({
      dispatchState: "accepted",
      executionState: "succeeded",
      result: contentOnly.result,
    });
    expect(entity?.children).toBeUndefined();
    expect(entity).toEqual(history.toolCalls.get("s")?.get("agent"));
    expect(turns(next)[0]?.blocks[0]).toMatchObject({ stateCounts: { succeeded: 1, unknown: 0, running: 0 } });
  });

  it("does not confuse accepted Agent dispatch with child completion or missing result with running", () => {
    const observations = [
      assistant("a", [
        { kind: "tool", callId: "agent" },
        { kind: "tool", callId: "missing" },
      ]),
    ];
    const state = composeTranscript(
      initial(),
      snapshot(observations, {
        toolOperations: [
          owner("agent"),
          owner("missing"),
          {
            type: "result",
            sessionId: "s",
            callId: "agent",
            result: { content: { availability: "missing" }, dispatch: "accepted", source: factSource },
          },
          {
            type: "child",
            sessionId: "s",
            callId: "agent",
            child: { childSessionId: "child", event: "completed", source: factSource },
          },
        ],
      }),
    );
    expect(turns(state)[0]?.blocks[0]).toMatchObject({ stateCounts: { unknown: 2, succeeded: 0, running: 0 } });
    const entity = state.toolCalls.get("s")?.get("agent");
    expect(entity?.dispatchState).toBe("accepted");
    expect(entity?.children?.get("child")).toMatchObject({ isComplete: true, state: "unknown" });
  });
});

function groupIds(state: TranscriptState): string[] {
  return turns(state).flatMap((turn) => turn.blocks.flatMap((block) => (block.kind === "toolGroup" ? [block.id] : [])));
}
const tools = (...callIds: string[]): AssistantObservation["blocks"] =>
  callIds.map((callId) => ({ kind: "tool", callId }));

describe("identity replacement", () => {
  it("keeps turn/group identity through source ID changes using shared calls, not temporary thoughts", () => {
    const first = composeTranscript(
      initial(),
      snapshot([
        assistant("old", [{ kind: "thinking", text: "plan", source: source("thought-old") }, ...tools("x", "y")]),
      ]),
    );
    const changed = composeTranscript(
      first,
      snapshot(
        [
          {
            ...assistant("new", [
              { kind: "thinking", text: "updated", source: source("thought-new") },
              ...tools("x", "y"),
            ]),
            source: { ...source("generated-new"), stability: "generated" },
          },
        ],
        { update: 1 },
      ),
    );
    expect(turns(changed)[0]?.id).toBe(turns(first)[0]?.id);
    expect(groupIds(changed)).toEqual(groupIds(first));
    const stableChanged = composeTranscript(changed, snapshot([assistant("real-new", tools("x", "y"))], { update: 2 }));
    expect(turns(stableChanged)[0]?.id).toBe(turns(first)[0]?.id);
    expect(groupIds(stableChanged)).toEqual(groupIds(first));
    expect(composeTranscript(stableChanged, snapshot([], { update: 2 }))).toBe(stableChanged);
  });

  it("keeps turn/group identity when the source changes and an earlier call becomes unresolved", () => {
    const first = composeTranscript(initial(), snapshot([assistant("old", tools("x", "y"))]));
    const changed = composeTranscript(
      first,
      snapshot([{ kind: "unresolved", source: source("orphan-x"), callId: "x" }, assistant("new", tools("y"))], {
        update: 1,
      }),
    );
    expect(changed.rows.map((row) => row.kind)).toEqual(["unresolved", "turn"]);
    expect(turns(changed)[0]?.id).toBe(turns(first)[0]?.id);
    expect(groupIds(changed)).toEqual(groupIds(first));
  });

  it.each(["unresolved", "other turn"])("ignores anchors outside the same turn's groups: %s", (location) => {
    const first = composeTranscript(initial(), snapshot([assistant("a", tools("x", "y"))]));
    const outside: TranscriptObservation[] =
      location === "unresolved"
        ? [{ kind: "unresolved", source: source("orphan-x"), callId: "x" }]
        : [assistant("other", tools("x")), notice];
    const changed = composeTranscript(first, snapshot([...outside, assistant("a", tools("y"))], { update: 1 }));
    expect(changed.rows[0]?.kind).toBe(location === "unresolved" ? "unresolved" : "turn");
    expect(turns(changed).at(-1)?.id).toBe(turns(first)[0]?.id);
    expect(groupIds(changed).at(-1)).toBe(groupIds(first)[0]);
  });

  it("assigns a split to the earliest surviving anchor and retains the earliest old segment on merge", () => {
    const first = composeTranscript(initial(), snapshot([assistant("a", tools("x", "y", "z"))]));
    const split = composeTranscript(
      first,
      snapshot([assistant("changed", [...tools("x"), { kind: "text", text: "separator" }, ...tools("y", "z")])], {
        update: 1,
      }),
    );
    expect(groupIds(split)[0]).toBe(groupIds(first)[0]);
    expect(groupIds(split)[1]).not.toBe(groupIds(first)[0]);
    const surviving = composeTranscript(split, snapshot([assistant("changed-again", tools("z"))], { update: 2 }));
    expect(groupIds(surviving)[0]).toBe(groupIds(split)[1]);
    const merged = composeTranscript(split, snapshot([assistant("merged", tools("x", "y", "z"))], { update: 2 }));
    expect(groupIds(merged)).toEqual([groupIds(first)[0]]);
    const turnSplit = composeTranscript(
      first,
      snapshot([assistant("head", tools("x")), notice, assistant("tail", tools("y", "z"))], { update: 1 }),
    );
    expect(turns(turnSplit)[0]?.id).toBe(turns(first)[0]?.id);
    expect(turns(turnSplit)[1]?.id).not.toBe(turns(first)[0]?.id);
    const turnMerge = composeTranscript(
      turnSplit,
      snapshot([assistant("merged", tools("x", "y", "z"))], { update: 2 }),
    );
    expect(turns(turnMerge)[0]?.id).toBe(turns(first)[0]?.id);
  });

  it("rejects stale windows, prunes facts and registry authoritatively, and does not resurrect removed runtime facts", () => {
    const first = composeTranscript(
      initial(),
      snapshot([assistant("a", tools("x", "y"))], {
        generation: 2,
        toolOperations: [
          owner("x"),
          owner("y"),
          resultOp("x"),
          { type: "execution", sessionId: "s", callId: "y", execution: { state: "running", source: factSource } },
        ],
      }),
    );
    expect(composeTranscript(first, snapshot([], { generation: 1, update: 999 }))).toBe(first);
    expect(composeTranscript(first, snapshot([], { generation: 3, authority: "stale" }))).toBe(first);
    const pruned = composeTranscript(first, snapshot([], { generation: 3 }));
    expect(pruned.toolCalls.size).toBe(0);
    expect(pruned.registry).toEqual([]);
    const restored = composeTranscript(
      pruned,
      snapshot([assistant("a", tools("x", "y"))], { generation: 4, toolOperations: [owner("x"), owner("y")] }),
    );
    expect(turns(restored)[0]?.blocks[0]).toMatchObject({ stateCounts: { unknown: 2, running: 0, succeeded: 0 } });
    expect(turns(restored)[0]?.id).not.toBe(turns(first)[0]?.id);
    const unreferenced = composeTranscript(initial(), snapshot([], { toolOperations: [resultOp("x")] }));
    expect(unreferenced.toolCalls.size).toBe(0);
    expect(composeTranscript(first, snapshot([], { generation: 2, update: -1 }))).toBe(first);
  });

  it("does not deduplicate anchorless text, isolates sessions, and never mutates inputs", () => {
    const generated = {
      ...assistant("temp", [{ kind: "text", text: "same" }]),
      source: { ...source("temp"), stability: "generated" },
    } as const;
    const input = snapshot([generated]);
    const inputBefore = structuredClone(input);
    const previous = initial();
    const previousBefore = structuredClone(previous);
    const first = composeTranscript(previous, input);
    const firstBefore = structuredClone(first);
    const next = composeTranscript(first, snapshot([generated], { update: 1 }));
    expect(turns(next)[0]?.id).not.toBe(turns(first)[0]?.id);
    expect(input).toEqual(inputBefore);
    expect(previous).toEqual(previousBefore);
    expect(first).toEqual(firstBefore);
    expect(composeTranscript(first, snapshot([], { sessionId: "other", generation: 99 }))).toBe(first);
    const other = composeTranscript(
      createTranscriptState({ sessionId: "other", namespace: "test", seed: 0 }),
      snapshot([assistant("temp", tools("x"))], { sessionId: "other", toolOperations: [resultOp("x")] }),
    );
    expect(other.toolCalls.size).toBe(0);
    expect(turns(other)[0]?.id).not.toBe(turns(first)[0]?.id);
    expect(composeTranscript(initial(), input)).toEqual(first);
  });
});
