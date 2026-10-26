import { type Draft, castDraft, enableMapSet } from "immer";
import { trimSessionMessages } from "../chat/agentChatRetention";
import type { AgentMessage } from "../chat/agentChatTypes";
import { composeSessionTranscript } from "../chat/transcript/session";
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
  const compose = (previous = session.transcript) =>
    composeSessionTranscript(
      previous,
      session.messages,
      session.streamingMessage,
      session.transcriptLiveSources,
      session.state === "running" && session.isTurnActive,
      session.state !== "idle" && session.state !== "error",
      shouldRetainOwnerlessRuntime,
    );
  let transcript = compose();
  const candidate = session.streamingMessage ? [...session.messages, session.streamingMessage] : session.messages;
  const retained = trimSessionMessages(candidate, transientToolResultIds);
  const retainedIds = new Set(retained.map((message) => message.id));
  const hasTrimmed = retained.length !== candidate.length;
  session.messages = retained.filter((message) => message.id !== session.streamingMessage?.id);
  if (session.streamingMessage && !retainedIds.has(session.streamingMessage.id)) session.streamingMessage = null;
  session.transcriptLiveSources = Object.fromEntries(
    Object.entries(session.transcriptLiveSources).filter(([id]) => retainedIds.has(id)),
  );
  session.rendererFinalAssistantIds = Object.fromEntries(
    Object.entries(session.rendererFinalAssistantIds).filter(([id]) => retainedIds.has(id)),
  );
  session.rendererFinalToolCallAssistantIds = Object.fromEntries(
    Object.entries(session.rendererFinalToolCallAssistantIds).filter(([id]) => retainedIds.has(id)),
  );
  if (hasTrimmed) transcript = compose(castDraft(transcript));
  session.transcript = castDraft(transcript);
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
