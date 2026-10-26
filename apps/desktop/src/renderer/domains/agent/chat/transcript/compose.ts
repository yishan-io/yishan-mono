import { buildTurnContent, summarizeToolGroup } from "./groups";
import { createIdentityAllocator, getCallAnchor, getObservationAnchors } from "./identity";
import { applyToolCallOperation, createToolCallsState, getToolCall } from "./toolCalls";
import type { AssistantObservation, TranscriptRow, TranscriptSnapshot, TranscriptState, TranscriptTurn } from "./types";

/** Creates isolated state using the caller's deterministic namespace and initial seed. */
export function createTranscriptState(options: {
  sessionId: string;
  namespace: string;
  seed: number;
}): TranscriptState {
  return {
    sessionId: options.sessionId,
    namespace: options.namespace,
    counter: options.seed,
    generation: -1,
    update: -1,
    registry: [],
    toolCalls: createToolCallsState(),
    rows: [],
  };
}

/** Projects a normalized ordered window; never mutates observations or previous state. */
export function composeTranscript(previous: TranscriptState, snapshot: TranscriptSnapshot): TranscriptState {
  if (
    snapshot.sessionId !== previous.sessionId ||
    snapshot.authority === "stale" ||
    snapshot.generation < previous.generation ||
    (snapshot.generation === previous.generation && snapshot.update <= previous.update)
  )
    return previous;
  const retained = new Set(
    snapshot.observations.flatMap((observation) => {
      if (observation.kind === "unresolved") return [observation.callId];
      return observation.kind === "assistant"
        ? observation.blocks.flatMap((block) => (block.kind === "tool" ? [block.callId] : []))
        : [];
    }),
  );
  const retainedCalls = new Map(
    [...(previous.toolCalls.get(previous.sessionId) ?? [])].filter(([callId]) => retained.has(callId)),
  );
  let toolCalls = retainedCalls.size ? new Map([[previous.sessionId, retainedCalls]]) : createToolCallsState();
  for (const operation of snapshot.toolOperations) {
    if (operation.sessionId === previous.sessionId && retained.has(operation.callId))
      toolCalls = applyToolCallOperation(toolCalls, operation);
  }
  const visibleCalls = new Set(
    snapshot.observations.flatMap((observation) =>
      observation.kind === "assistant"
        ? observation.blocks.flatMap((block) => (block.kind === "tool" ? [block.callId] : []))
        : [],
    ),
  );
  const identities = createIdentityAllocator(previous, new Set(snapshot.observations.flatMap(getObservationAnchors)));
  const turnAnchors = new Set(
    snapshot.observations.flatMap((observation) =>
      observation.kind === "assistant" ? getObservationAnchors(observation) : [],
    ),
  );
  const rows: TranscriptRow[] = [];
  let current: { rowIndex: number; items: AssistantObservation[] } | undefined;
  let timingItems: AssistantObservation[] = [];
  let startTimestampMs: number | undefined;
  let previousTurnIndex: number | undefined;
  const finishTurn = () => {
    if (!current) return;
    const content = buildTurnContent(current.items);
    const id = identities.allocate("turn", "", current.items.flatMap(getObservationAnchors), turnAnchors);
    // Only projected groups in this turn can keep an old group anchor alive.
    const groupAnchors = new Set(
      content.blocks.flatMap((block) =>
        block.kind === "toolGroup"
          ? block.members.flatMap((member) => (member.kind === "tool" ? [getCallAnchor(member.callId)] : []))
          : [],
      ),
    );
    const blocks = content.blocks.map((block) =>
      block.kind === "toolGroup"
        ? {
            ...summarizeToolGroup(block, toolCalls, previous.sessionId),
            id: identities.allocate(
              "group",
              id,
              block.members.flatMap((member) => (member.kind === "tool" ? [getCallAnchor(member.callId)] : [])),
              groupAnchors,
            ),
          }
        : block,
    );
    const isWorking = current.items.some((item) => item.isStreaming);
    const turn: TranscriptTurn = {
      id,
      blocks,
      summary: content.summary,
      isWorking,
      timingContinues: false,
      startedAtMs: timingItems.find((item) => typeof item.startedAtMs === "number")?.startedAtMs,
      startTimestampMs,
      workedDurationMs: isWorking ? null : getFinishedDuration(timingItems, startTimestampMs),
    };
    rows[current.rowIndex] = { kind: "turn", turn };
    previousTurnIndex = current.rowIndex;
    current = undefined;
  };
  for (const observation of snapshot.observations) {
    if (observation.kind === "assistant") {
      if (!current) {
        if (previousTurnIndex !== undefined) {
          const prior = rows[previousTurnIndex];
          if (prior?.kind === "turn")
            rows[previousTurnIndex] = {
              kind: "turn",
              turn: { ...prior.turn, timingContinues: true, isWorking: false, workedDurationMs: null },
            };
        }
        current = { rowIndex: rows.length, items: [] };
        // Reserved slot, filled by finishTurn before returning.
        rows.push({ kind: "user", id: "", text: "" });
      }
      current.items.push(observation);
      timingItems.push(observation);
      continue;
    }
    if (
      observation.kind === "unresolved" &&
      visibleCalls.has(observation.callId) &&
      getToolCall(toolCalls, { sessionId: previous.sessionId, callId: observation.callId })?.owner
    )
      continue;
    finishTurn();
    const id = identities.allocate(observation.kind, "", getObservationAnchors(observation));
    if (observation.kind === "user") {
      rows.push({
        kind: "user",
        id,
        text: observation.text,
        ...(observation.timestampMs !== undefined ? { timestampMs: observation.timestampMs } : {}),
      });
      startTimestampMs = observation.timestampMs;
      timingItems = [];
      previousTurnIndex = undefined;
    } else if (observation.kind === "unmatched") rows.push({ ...observation, id });
    else if (observation.kind === "completion")
      rows.push({ kind: "completion", id, completion: observation.completion });
    else
      rows.push({
        kind: "unresolved",
        id,
        callId: observation.callId,
        entity: getToolCall(toolCalls, { sessionId: previous.sessionId, callId: observation.callId }),
      });
  }
  finishTurn();
  if (snapshot.isWorking) {
    for (let index = rows.length - 1; index >= 0; index--) {
      const row = rows[index];
      if (row?.kind === "completion" || row?.kind === "unresolved" || row?.kind === "unmatched") continue;
      if (row?.kind === "turn")
        rows[index] = { kind: "turn", turn: { ...row.turn, isWorking: true, workedDurationMs: null } };
      break;
    }
  }
  return {
    ...previous,
    ...identities.finish(),
    generation: snapshot.generation,
    update: snapshot.update,
    toolCalls,
    rows,
  };
}

/** Elapsed time uses an explicit caller clock, never Date.now(). */
export function getLiveElapsedMs(turn: TranscriptTurn, nowMs: number): number | null {
  const start = turn.startedAtMs ?? turn.startTimestampMs;
  return turn.isWorking && start !== undefined && Number.isFinite(start) ? Math.max(0, nowMs - start) : null;
}

function getFinishedDuration(items: readonly AssistantObservation[], startTimestampMs?: number): number | null {
  const first = items.find((item) => item.startedAtMs !== undefined && Number.isFinite(item.startedAtMs));
  const last = items.at(-1);
  if (
    first?.startedAtMs !== undefined &&
    last?.startedAtMs !== undefined &&
    Number.isFinite(last.startedAtMs) &&
    last.durationMs !== undefined &&
    Number.isFinite(last.durationMs)
  ) {
    return Math.max(0, last.startedAtMs + last.durationMs - first.startedAtMs);
  }
  const durations = items.flatMap((item) => (typeof item.durationMs === "number" ? [item.durationMs] : []));
  if (durations.length) return durations.reduce((sum, duration) => sum + duration, 0);
  const end = [...items]
    .reverse()
    .find((item) => item.timestampMs !== undefined && Number.isFinite(item.timestampMs))?.timestampMs;
  return startTimestampMs !== undefined && Number.isFinite(startTimestampMs) && end !== undefined
    ? Math.max(0, end - startTimestampMs)
    : null;
}
