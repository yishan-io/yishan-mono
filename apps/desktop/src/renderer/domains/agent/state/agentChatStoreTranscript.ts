import { type Draft, castDraft, current, enableMapSet, isDraft } from "immer";
import { trimSessionMessages } from "../chat/agentChatRetention";
import type { AgentMessage } from "../chat/agentChatTypes";
import { getTranscriptContextTokens, projectTranscript } from "../chat/transcript/presentation";
import { composeSessionTranscript } from "../chat/transcript/session";
import { refreshSubagentSnapshotActivity } from "../chat/transcript/subagentSnapshots";
import type { AgentChatSessionData } from "./agentChatStoreSession";

enableMapSet();

/** Registers a new immutable live fact before projecting the same transaction. */
export function registerLiveMessage(session: Draft<AgentChatSessionData>, id: string, isFinal: boolean): void {
  session.transcriptLiveSources[id] = { revision: session.transcript.update + 1, isFinal };
}

/** Composes before retention, then atomically synchronizes the retained raw/model windows. */
export function refreshSessionTranscript(
  session: Draft<AgentChatSessionData>,
  transientToolResultIds?: ReadonlySet<string>,
  shouldRetainOwnerlessRuntime = true,
): void {
  // Read current transaction facts once; original() would discard in-flight mutations.
  const snapshot = isDraft(session) ? current(session) : session;
  let { messages, streamingMessage, transcriptLiveSources } = snapshot;
  const compose = (previous = snapshot.transcript) =>
    composeSessionTranscript(
      previous,
      messages,
      streamingMessage,
      transcriptLiveSources,
      snapshot.state === "running" && snapshot.isTurnActive,
      snapshot.state !== "idle" && snapshot.state !== "error",
      shouldRetainOwnerlessRuntime,
      snapshot.subagentSessionEndedAtMs,
    );
  let transcript = compose();
  const candidate = streamingMessage ? [...messages, streamingMessage] : messages;
  const retained = trimSessionMessages(candidate, transientToolResultIds);
  const retainedIds = new Set(retained.map((message) => message.id));
  const hasTrimmed = retained.length !== candidate.length;
  messages = retained.filter((message) => message.id !== streamingMessage?.id);
  if (streamingMessage && !retainedIds.has(streamingMessage.id)) streamingMessage = null;
  transcriptLiveSources = Object.fromEntries(
    Object.entries(transcriptLiveSources).filter(([id]) => retainedIds.has(id)),
  );
  session.messages = castDraft(messages);
  session.streamingMessage = castDraft(streamingMessage);
  session.transcriptLiveSources = transcriptLiveSources;
  session.rendererFinalAssistantIds = Object.fromEntries(
    Object.entries(snapshot.rendererFinalAssistantIds).filter(([id]) => retainedIds.has(id)),
  );
  session.rendererFinalToolCallAssistantIds = Object.fromEntries(
    Object.entries(snapshot.rendererFinalToolCallAssistantIds).filter(([id]) => retainedIds.has(id)),
  );
  if (hasTrimmed) transcript = compose(transcript);
  session.transcript = castDraft(transcript);
  session.presentation = castDraft(
    projectTranscript(transcript, { contextTokens: getTranscriptContextTokens(messages) }),
  );
  session.subagentSnapshots = castDraft(
    refreshSubagentSnapshotActivity(
      snapshot.subagentSnapshots,
      transcript,
      snapshot.subagentSessionEndedAtMs,
      snapshot.state === "error",
    ),
  );
}

/** Revokes live authority when history replaces the actual fact, even with the same message ID. */
export function reconcileLiveMessages(
  session: Draft<AgentChatSessionData>,
  nextMessages: readonly AgentMessage[],
): void {
  const previousMessages = new Map(session.messages.map((message) => [message.id, message]));
  for (const message of nextMessages) {
    if (!session.transcriptLiveSources[message.id]) continue;
    const previous = previousMessages.get(message.id);
    if (
      !previous ||
      previous.role !== message.role ||
      previous.toolCallId !== message.toolCallId ||
      previous.isError !== message.isError ||
      previous.customType !== message.customType ||
      previous.display !== message.display ||
      !equalFactValue(previous.content, message.content) ||
      !equalFactValue(previous.details, message.details)
    )
      delete session.transcriptLiveSources[message.id];
  }
}

// Compare the retained facts directly; never cache serialized payloads or historical copies.
function equalFactValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equalFactValue(value, right[index]))
    );
  }
  const rightFields = new Map(Object.entries(right));
  const leftFields = Object.entries(left);
  return (
    leftFields.length === rightFields.size &&
    leftFields.every(([key, value]) => rightFields.has(key) && equalFactValue(value, rightFields.get(key)))
  );
}
