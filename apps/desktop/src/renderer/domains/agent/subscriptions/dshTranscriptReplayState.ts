import type { DSHEvent } from "./dshTranscript";

export type DSHTextStream = { key: string; text: string; timestamp: number };
export type DSHTranscriptReplayState = { activeTextStream: DSHTextStream | null; turnError: string | null };

export function createDSHTranscriptReplayState(): DSHTranscriptReplayState {
  return { activeTextStream: null, turnError: null };
}

export function rebuildDSHTranscriptReplayState(events: readonly DSHEvent[]): DSHTranscriptReplayState {
  return events.reduce(applyDSHTranscriptReplayEvent, createDSHTranscriptReplayState());
}

export function applyDSHTranscriptReplayEvent(
  state: DSHTranscriptReplayState,
  event: DSHEvent,
): DSHTranscriptReplayState {
  if (event.type === "turn/start") return createDSHTranscriptReplayState();
  if (event.type === "turn/end") {
    return { activeTextStream: null, turnError: getTurnError(event) };
  }
  if (event.type === "assistant/message" && state.activeTextStream?.key === getStreamKey(event)) {
    return { ...state, activeTextStream: null };
  }
  if (event.type !== "assistant/chunk") return state;
  const chunk = event.data.chunk;
  const streamKey = getStreamKey(event);
  if (!chunk || typeof chunk !== "object" || Array.isArray(chunk) || !streamKey) return state;
  const record = chunk as Record<string, unknown>;
  if (record.type !== "text-delta" || typeof record.text !== "string") return state;
  const text = state.activeTextStream?.key === streamKey ? `${state.activeTextStream.text}${record.text}` : record.text;
  return { ...state, activeTextStream: { key: streamKey, text, timestamp: event.time } };
}

function getTurnError(event: DSHEvent): string | null {
  const reason =
    typeof event.data.reason === "object" && event.data.reason !== null
      ? (event.data.reason as Record<string, unknown>)
      : null;
  if (reason?.kind !== "error") return null;
  const error =
    typeof reason.error === "object" && reason.error !== null ? (reason.error as Record<string, unknown>) : null;
  return typeof error?.message === "string" ? error.message : "Agent turn failed";
}

function getStreamKey(event: DSHEvent): string | null {
  const { step, turn } = event.data;
  return typeof turn === "number" &&
    Number.isSafeInteger(turn) &&
    turn >= 0 &&
    typeof step === "number" &&
    Number.isSafeInteger(step) &&
    step >= 0
    ? `${turn}:${step}`
    : null;
}
