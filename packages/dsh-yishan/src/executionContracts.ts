import { type DurableCursor, parseDurableCursor } from "./durableCursor";
import { type SessionBoundData, parseSessionBoundData } from "./sessionBindingContracts";
import {
  type WireRecord,
  requireExactRecord,
  requireNonEmptyString,
  requireSafeIntegerAtLeast,
} from "./wireValidation";

/** Identifies the workspace and live DSH session to start, prompt, cancel, subscribe to, or flush. */
export type SessionExecutionRequest = {
  cwd: string;
  sessionId: string;
};

/** Exact request to start one identified DSH session. */
export type SessionStartRequest = SessionExecutionRequest & {
  binding: SessionBoundData;
  /** Optional per-session model/provider override; merged with the process-level initializeOptions. */
  agentOptions?: { model?: string; provider?: string };
};

/** Exact request to cancel one identified DSH session. */
export type SessionCancelRequest = SessionExecutionRequest;

/** Exact request for a session baseline strictly after one acknowledged sequence. */
export type SessionSubscribeRequest = SessionExecutionRequest & {
  afterSeq: number;
};

/** Exact request to flush one identified DSH session. */
export type SessionFlushRequest = SessionExecutionRequest;

/** Confirms that a session has started in one runtime incarnation. */
export type SessionStartResult = {
  sessionId: string;
  incarnation: string;
};

/** One text-only block in a semantic user prompt. */
export type TextPromptContentBlock = {
  type: "text";
  text: string;
};

/** Enqueues one semantic, text-only user prompt. */
export type SessionPromptRequest = SessionExecutionRequest & {
  contentBlocks: TextPromptContentBlock[];
};

/** Durable identity assigned to one accepted prompt. */
export type SessionPromptResult = {
  messageId: string;
};

/** Reports whether cancellation changed the requested session. */
export type SessionCancelResult = {
  sessionId: string;
  cancelled: boolean;
};

/** One DSH event with a validated non-negative sequence number. */
export type SequencedSessionEvent = WireRecord & {
  seq: number;
};

/** Snapshot returned before live session events are subscribed. */
export type SessionSubscribeResult = {
  sessionId: string;
  incarnation: string;
  events: SequencedSessionEvent[];
  asOfSeq: number;
  durableThroughSeq: number;
  headSeq: number;
};

/** Notification that invalidates a prior transcript incarnation. */
export type TranscriptResetNotification = {
  sessionId: string;
  incarnation: string;
  headSeq: number;
};

/** Parses the exact workspace-scoped request shape shared by start, cancel, and flush. */
export function parseSessionStartRequest(payload: unknown): SessionStartRequest {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("session start request must be an object");
  }
  const record = payload as Record<string, unknown>;
  // Allow optional agentOptions field in addition to the three required fields.
  const allowedKeys = new Set(["cwd", "sessionId", "binding", "agentOptions"]);
  if (Object.keys(record).some((k) => !allowedKeys.has(k))) {
    throw new TypeError("session start request has unsupported fields");
  }
  const cwd = requireNonEmptyString(record, "cwd");
  const binding = parseSessionBoundData(record.binding);
  if (binding.cwd !== cwd) throw new TypeError("binding.cwd must equal cwd");
  const agentOptions = parseStartAgentOptions(record.agentOptions);
  return {
    cwd,
    sessionId: requireNonEmptyString(record, "sessionId"),
    binding,
    ...(agentOptions ? { agentOptions } : {}),
  };
}

function parseStartAgentOptions(raw: unknown): { model?: string; provider?: string } | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const model = typeof rec.model === "string" && rec.model.trim() ? rec.model.trim() : undefined;
  const provider = typeof rec.provider === "string" && rec.provider.trim() ? rec.provider.trim() : undefined;
  return model || provider ? { ...(model ? { model } : {}), ...(provider ? { provider } : {}) } : undefined;
}

/** Parses the exact session-start receipt and checks its requested identity. */
export function parseSessionStartResult(payload: unknown, requestedSessionId: string): SessionStartResult {
  const result = requireExactRecord(payload, "session start result", ["sessionId", "incarnation"]);
  return {
    sessionId: requireRequestedSessionId(result, requestedSessionId),
    incarnation: requireNonEmptyString(result, "incarnation"),
  };
}

/** Parses one exact text-only semantic prompt. */
/** Parses the stock SDK prompt shape before routing an owned session. */
export function parseStockSessionPromptRequest(payload: unknown): Omit<SessionPromptRequest, "cwd"> {
  const request = requireExactRecord(payload, "stock session prompt request", ["sessionId", "contentBlocks"]);
  if (!Array.isArray(request.contentBlocks) || request.contentBlocks.length === 0) {
    throw new TypeError("contentBlocks must contain text blocks");
  }
  return {
    sessionId: requireNonEmptyString(request, "sessionId"),
    contentBlocks: request.contentBlocks.map(parseTextPromptContentBlock),
  };
}

export function parseSessionPromptRequest(payload: unknown): SessionPromptRequest {
  const request = requireExactRecord(payload, "session prompt request", ["cwd", "sessionId", "contentBlocks"]);
  if (!Array.isArray(request.contentBlocks) || request.contentBlocks.length === 0) {
    throw new TypeError("contentBlocks must contain text blocks");
  }
  return {
    cwd: requireNonEmptyString(request, "cwd"),
    sessionId: requireNonEmptyString(request, "sessionId"),
    contentBlocks: request.contentBlocks.map(parseTextPromptContentBlock),
  };
}

/** Parses the exact durable prompt receipt. */
export function parseSessionPromptResult(payload: unknown): SessionPromptResult {
  const result = requireExactRecord(payload, "session prompt result", ["messageId"]);
  return { messageId: requireNonEmptyString(result, "messageId") };
}

/** Parses the exact session-cancel request. */
export function parseSessionCancelRequest(payload: unknown): SessionCancelRequest {
  return parseSessionExecutionRequest(payload, "session cancel request");
}

/** Parses the exact cancellation receipt and checks its requested identity. */
export function parseSessionCancelResult(payload: unknown, requestedSessionId: string): SessionCancelResult {
  const result = requireExactRecord(payload, "session cancel result", ["sessionId", "cancelled"]);
  if (typeof result.cancelled !== "boolean") throw new TypeError("cancelled must be a boolean");
  return { sessionId: requireRequestedSessionId(result, requestedSessionId), cancelled: result.cancelled };
}

/** Parses the exact request for a baseline plus live event subscription. */
export function parseSessionSubscribeRequest(payload: unknown): SessionSubscribeRequest {
  const request = requireExactRecord(payload, "session subscribe request", ["cwd", "sessionId", "afterSeq"]);
  const afterSeq = requireSafeIntegerAtLeast(request, "afterSeq", -1);
  requireAfterSeq(afterSeq);
  return {
    cwd: requireNonEmptyString(request, "cwd"),
    sessionId: requireNonEmptyString(request, "sessionId"),
    afterSeq,
  };
}

/** Parses and validates a baseline snapshot for the requested session and cursor. */
export function parseSessionSubscribeResult(
  payload: unknown,
  requestedSessionId: string,
  afterSeq: number,
): SessionSubscribeResult {
  requireAfterSeq(afterSeq);
  const result = requireExactRecord(payload, "session subscribe result", [
    "sessionId",
    "incarnation",
    "events",
    "asOfSeq",
    "durableThroughSeq",
    "headSeq",
  ]);
  if (!Array.isArray(result.events)) throw new TypeError("events must be an array");
  const events = result.events.map(parseSequencedSessionEvent);
  const asOfSeq = requireSafeIntegerAtLeast(result, "asOfSeq", -1);
  const durableThroughSeq = requireSafeIntegerAtLeast(result, "durableThroughSeq", -1);
  const headSeq = requireSafeIntegerAtLeast(result, "headSeq", -1);
  requireSubscribeConsistency(events, afterSeq, asOfSeq, durableThroughSeq, headSeq);
  return {
    sessionId: requireRequestedSessionId(result, requestedSessionId),
    incarnation: requireNonEmptyString(result, "incarnation"),
    events,
    asOfSeq,
    durableThroughSeq,
    headSeq,
  };
}

/** Parses the exact request for a durability checkpoint. */
export function parseSessionFlushRequest(payload: unknown): SessionFlushRequest {
  return parseSessionExecutionRequest(payload, "session flush request");
}

/** Parses a durable flush receipt and checks its requested session identity. */
export function parseSessionFlushResult(payload: unknown, requestedSessionId: string): DurableCursor {
  const cursor = parseDurableCursor(payload);
  if (cursor.sessionId !== requestedSessionId) throw new TypeError("sessionId does not match requested session");
  return cursor;
}

/** Parses the exact notification that resets a session transcript incarnation. */
export function parseTranscriptResetNotification(payload: unknown): TranscriptResetNotification {
  const notification = requireExactRecord(payload, "transcript reset notification", [
    "sessionId",
    "incarnation",
    "headSeq",
  ]);
  return {
    sessionId: requireNonEmptyString(notification, "sessionId"),
    incarnation: requireNonEmptyString(notification, "incarnation"),
    headSeq: requireSafeIntegerAtLeast(notification, "headSeq", -1),
  };
}

function parseSessionExecutionRequest(payload: unknown, name: string): SessionExecutionRequest {
  const request = requireExactRecord(payload, name, ["cwd", "sessionId"]);
  return {
    cwd: requireNonEmptyString(request, "cwd"),
    sessionId: requireNonEmptyString(request, "sessionId"),
  };
}

function parseTextPromptContentBlock(payload: unknown): TextPromptContentBlock {
  const block = requireExactRecord(payload, "prompt content block", ["type", "text"]);
  if (block.type !== "text" || typeof block.text !== "string") {
    throw new TypeError("contentBlocks must contain text blocks");
  }
  return { type: "text", text: block.text };
}

function parseSequencedSessionEvent(payload: unknown): SequencedSessionEvent {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("events must contain objects");
  }
  const event = payload as WireRecord;
  return { ...event, seq: requireSafeIntegerAtLeast(event, "seq", 0) };
}

function requireRequestedSessionId(result: WireRecord, requestedSessionId: string): string {
  const sessionId = requireNonEmptyString(result, "sessionId");
  if (sessionId !== requestedSessionId) throw new TypeError("sessionId does not match requested session");
  return sessionId;
}

function requireAfterSeq(afterSeq: number): void {
  if (!Number.isSafeInteger(afterSeq) || afterSeq < -1) {
    throw new TypeError("afterSeq must be a safe integer greater than or equal to -1");
  }
  if (afterSeq === Number.MAX_SAFE_INTEGER) {
    throw new TypeError("afterSeq must be less than Number.MAX_SAFE_INTEGER");
  }
}

function requireSubscribeConsistency(
  events: SequencedSessionEvent[],
  afterSeq: number,
  asOfSeq: number,
  durableThroughSeq: number,
  headSeq: number,
): void {
  if (asOfSeq > headSeq) throw new TypeError("asOfSeq cannot exceed headSeq");
  if (durableThroughSeq !== asOfSeq) throw new TypeError("durableThroughSeq must equal asOfSeq");
  if (events.length === 0 && asOfSeq !== afterSeq) {
    throw new TypeError("empty events require asOfSeq to equal afterSeq");
  }
  if (events.length > 0 && events[0]?.seq !== afterSeq + 1) {
    throw new TypeError("events must start at afterSeq plus one");
  }
  if (events.some((event, index) => event.seq !== afterSeq + index + 1)) {
    throw new TypeError("events must have contiguous sequence numbers");
  }
  if (events.length > 0 && events.at(-1)?.seq !== asOfSeq) {
    throw new TypeError("asOfSeq must equal the final event sequence");
  }
}

/** Sets the model/provider for the next turn of a live session. */
export type SetModelRequest = SessionExecutionRequest & {
  model: string;
  provider?: string;
};

export function parseSetModelRequest(payload: unknown): SetModelRequest {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("set model request must be an object");
  }
  const rec = payload as Record<string, unknown>;
  const allowed = new Set(["cwd", "sessionId", "model", "provider"]);
  if (Object.keys(rec).some((k) => !allowed.has(k))) {
    throw new TypeError("set model request has unsupported fields");
  }
  const model = typeof rec.model === "string" && rec.model.trim() ? rec.model.trim() : undefined;
  if (!model) throw new TypeError("model is required");
  const provider = typeof rec.provider === "string" && rec.provider.trim() ? rec.provider.trim() : undefined;
  return {
    cwd: requireNonEmptyString(rec, "cwd"),
    sessionId: requireNonEmptyString(rec, "sessionId"),
    model,
    ...(provider ? { provider } : {}),
  };
}
