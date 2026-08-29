import type { DurableCursor } from "../shared/cursor";
import {
  type WireRecord,
  requireExactRecord,
  requireNonEmptyString,
  requireSafeIntegerAtLeast,
} from "../shared/validation";
import type { SessionBoundData } from "./binding";

/** Identifies the workspace and live DSH session to start, prompt, cancel, subscribe to, or flush. */
export type SessionExecutionRequest = {
  cwd: string;
  sessionId: string;
};

/** Command to start one identified DSH session. */
export type SessionStartRequest = SessionExecutionRequest & {
  binding: SessionBoundData;
  /** Optional per-session model/provider override; merged with the process-level initialize options. */
  agentOptions?: { model?: string; provider?: string };
};

/** Command to cancel one identified DSH session. */
export type SessionCancelRequest = SessionExecutionRequest;

/** Command for a session baseline strictly after one acknowledged sequence. */
export type SessionSubscribeRequest = SessionExecutionRequest & { afterSeq: number };

/** Command to flush one identified DSH session. */
export type SessionFlushRequest = SessionExecutionRequest;

/** Confirms that a session has started in one runtime instance ID. */
export type SessionStartResult = { sessionId: string; instanceId: string };

/** One text-only block in a semantic user prompt. */
export type TextPromptContentBlock = { type: "text"; text: string };

/** Command that enqueues one semantic, text-only user prompt. */
export type SessionPromptRequest = SessionExecutionRequest & { contentBlocks: TextPromptContentBlock[] };

/** Durable identity assigned to one accepted prompt. */
export type SessionPromptResult = { messageId: string };

/** Reports whether cancellation changed the requested session. */
export type SessionCancelResult = { sessionId: string; cancelled: boolean };

/** One DSH event with a validated non-negative sequence number. */
export type SequencedSessionEvent = WireRecord & { seq: number };

/** Snapshot returned before live session events are subscribed. */
export type SessionSubscribeResult = {
  sessionId: string;
  instanceId: string;
  events: SequencedSessionEvent[];
  asOfSeq: number;
  durableThroughSeq: number;
  headSeq: number;
};

/** Notification that invalidates a prior transcript instance ID. */
export type TranscriptResetNotification = { sessionId: string; instanceId: string; headSeq: number };

/** Parses the untrusted stock SDK prompt shape before routing an owned session. */
export function parseStockSessionPromptRequest(payload: unknown): Omit<SessionPromptRequest, "cwd"> {
  const request = requireExactRecord(payload, "stock session prompt request", ["sessionId", "contentBlocks"]);
  return {
    sessionId: requireNonEmptyString(request, "sessionId"),
    contentBlocks: parsePromptContentBlocks(request),
  };
}

/** Parses the exact notification that resets a session transcript instance ID. */
export function parseTranscriptResetNotification(payload: unknown): TranscriptResetNotification {
  const notification = requireExactRecord(payload, "transcript reset notification", [
    "sessionId",
    "instanceId",
    "headSeq",
  ]);
  return {
    sessionId: requireNonEmptyString(notification, "sessionId"),
    instanceId: requireNonEmptyString(notification, "instanceId"),
    headSeq: requireSafeIntegerAtLeast(notification, "headSeq", -1),
  };
}

function parsePromptContentBlocks(request: WireRecord): TextPromptContentBlock[] {
  if (!Array.isArray(request.contentBlocks) || request.contentBlocks.length === 0) {
    throw new TypeError("contentBlocks must contain text blocks");
  }
  return request.contentBlocks.map(parseTextPromptContentBlock);
}

function parseTextPromptContentBlock(payload: unknown): TextPromptContentBlock {
  const block = requireExactRecord(payload, "prompt content block", ["type", "text"]);
  if (block.type !== "text" || typeof block.text !== "string") {
    throw new TypeError("contentBlocks must contain text blocks");
  }
  return { type: "text", text: block.text };
}

/** Sets the live selection; DSH snapshots it when each step enters prompt assembly. */
export type SetModelRequest = SessionExecutionRequest & { model: string; provider?: string };

/** Durable cursor returned when a session flush completes. */
export type SessionFlushResult = DurableCursor;
