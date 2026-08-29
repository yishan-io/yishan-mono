import type { AgentContentBlock, AgentMessage } from "../chat/agentChatTypes";
import { validRecognizedData } from "./dshTranscriptValidation";

const MAX_SAFE_SEQUENCE = Number.MAX_SAFE_INTEGER;
const SURFACE_TYPES = new Set(["user/message", "assistant/message", "tool/result"]);
const KNOWN_TYPES = new Set([
  "turn/start",
  "turn/end",
  "step/start",
  "step/end",
  "user/message",
  "assistant/chunk",
  "assistant/message",
  "tool/call",
  "tool/result",
  "todo/write",
  "request/header",
  "request/context",
  "session/end-seed",
  "session/title",
  "agent/inbox/spliced",
]);
type JsonRecord = Record<string, unknown>;
type SurfaceOp = "append" | { op: "replace"; start: number; end: number };
export type DSHEvent = {
  type: string;
  seq: number;
  time: number;
  data: JsonRecord;
  ignorable?: true;
  surfaceOp?: SurfaceOp;
  sourceEventSeqs?: number[];
};
export type DSHUpdate = {
  event?: DSHEvent;
  status?: { sessionId: string; status: "idle" | "running" };
  cursor?: { sessionId: string; durableThroughSeq: number; instanceId: string };
  reset?: { sessionId: string; instanceId: string; headSeq: number };
  lifecycle?: DSHLifecycle;
  lifecycleResync?: DSHLifecycleResync;
  unavailable?: true;
};
export type DSHLifecycle = {
  version: 1;
  parentSessionId: string;
  instanceId: string;
  revision: number;
  event: "started" | "finished";
  runId: string;
  childSessionId: string;
  provider: string;
  local: boolean;
  stopReason?: "completed" | "aborted" | "error" | "max-tokens" | "refusal";
};
export type DSHLifecycleResync = { parentSessionId: string; instanceId: string; revision: number };
export type DSHFrontendRouteIdentity = { sessionId: string; tabId: string };
export type DSHFrontendPayload = {
  sessionId: string;
  tabId: string;
  workspaceId: string;
  instanceId: string;
  update: DSHUpdate;
};

/** Validates the exact untrusted DSH frontend notification wire contract. */
export function parseDSHFrontendPayload(input: unknown): DSHFrontendPayload | null {
  const payload = exactRecord(input, ["sessionId", "tabId", "workspaceId", "instanceId", "update"]);
  if (!payload) return null;
  const sessionId = requiredString(payload, "sessionId");
  const tabId = requiredString(payload, "tabId");
  const workspaceId = requiredString(payload, "workspaceId");
  const instanceId = requiredString(payload, "instanceId");
  const update = sessionId && instanceId ? parseUpdate(payload.update, sessionId, instanceId) : null;
  return sessionId && tabId && workspaceId && instanceId && update
    ? { sessionId, tabId, workspaceId, instanceId, update }
    : null;
}

/** Recovers the tab/session route only when both outer identifiers are present. */
export function parseDSHFrontendRouteIdentity(input: unknown): DSHFrontendRouteIdentity | null {
  const payload = asRecord(input);
  const sessionId = payload && requiredString(payload, "sessionId");
  const tabId = payload && requiredString(payload, "tabId");
  return sessionId && tabId ? { sessionId, tabId } : null;
}

/** Returns whether an event is unknown and must cause durable transcript recovery. */
export function isUnknownRequiredDSHEvent(event: DSHEvent): boolean {
  return !KNOWN_TYPES.has(event.type) && event.ignorable !== true;
}

/** Projects complete DSH log records into the visible, ordered transcript surface. */
export function projectDSHTranscript(events: readonly DSHEvent[]): AgentMessage[] {
  const surface: Array<{ seq: number; message: AgentMessage }> = [];
  for (const event of events) {
    if (!KNOWN_TYPES.has(event.type)) {
      if (event.ignorable) continue;
      throw new Error(`Unknown required DSH event: ${event.type}`);
    }
    if (!SURFACE_TYPES.has(event.type)) continue;
    const message = projectSurfaceMessage(event);
    if (event.surfaceOp === "append") {
      surface.push({ seq: event.seq, message });
      continue;
    }
    const surfaceOp = event.surfaceOp;
    if (!surfaceOp) throw new Error("DSH surface event is missing surfaceOp");
    const start = surface.findIndex((entry) => entry.seq === surfaceOp.start);
    const end = surface.findIndex((entry) => entry.seq === surfaceOp.end);
    if (start < 0 || end < start) throw new Error("DSH surface replacement range is invalid");
    const replacedSurfaceEventSeqs = surface.slice(start, end + 1).map((entry) => entry.seq);
    if (!replacedSurfaceEventSeqs.every((replacedSeq) => event.sourceEventSeqs?.includes(replacedSeq)))
      throw new Error("DSH surface replacement provenance is invalid");
    surface.splice(start, end - start + 1, { seq: event.seq, message });
  }
  return surface.map((entry) => entry.message);
}

function parseUpdate(input: unknown, sessionId: string, instanceId: string): DSHUpdate | null {
  const update = asRecord(input);
  if (!update || Object.keys(update).length !== 1) return null;
  if ("event" in update) {
    const event = parseEventWrapper(update.event, sessionId);
    return event ? { event } : null;
  }
  if ("status" in update) {
    const status = parseStatus(update.status, sessionId);
    return status ? { status } : null;
  }
  if ("cursor" in update) {
    const cursor = parseCursor(update.cursor, sessionId, instanceId);
    return cursor ? { cursor } : null;
  }
  if ("reset" in update) {
    const reset = parseReset(update.reset, sessionId, instanceId);
    return reset ? { reset } : null;
  }
  if ("lifecycle" in update) {
    const lifecycle = parseLifecycle(update.lifecycle, sessionId, instanceId);
    return lifecycle ? { lifecycle } : null;
  }
  if ("lifecycleResync" in update) {
    const lifecycleResync = parseLifecycleResync(update.lifecycleResync, sessionId, instanceId);
    return lifecycleResync ? { lifecycleResync } : null;
  }
  return update.unavailable === true ? { unavailable: true } : null;
}
function parseEventWrapper(input: unknown, outerSessionId: string): DSHEvent | null {
  const wrapper = exactRecord(input, ["sessionId", "seq", "event"]);
  if (!wrapper || requiredString(wrapper, "sessionId") !== outerSessionId) return null;
  const seq = safeSequence(wrapper.seq, 0);
  const event = parseEvent(wrapper.event);
  return seq !== null && event?.seq === seq ? event : null;
}
function parseEvent(input: unknown): DSHEvent | null {
  const event = asRecord(input);
  if (!event || !hasOnlyKeys(event, ["type", "seq", "time", "data", "ignorable", "surfaceOp", "sourceEventSeqs"]))
    return null;
  const type = requiredString(event, "type");
  const seq = safeSequence(event.seq, 0);
  const time = safeSequence(event.time, 0);
  const data = asRecord(event.data);
  if (!type || seq === null || time === null || !data || (event.ignorable !== undefined && event.ignorable !== true))
    return null;
  const isKnown = KNOWN_TYPES.has(type);
  const surfaceOp = event.surfaceOp === undefined ? undefined : parseSurfaceOp(event.surfaceOp);
  const sourceEventSeqs =
    event.sourceEventSeqs === undefined
      ? undefined
      : parseSourceEventSeqs(event.sourceEventSeqs, type === "assistant/message");
  if ((event.surfaceOp !== undefined && !surfaceOp) || (event.sourceEventSeqs !== undefined && !sourceEventSeqs))
    return null;
  const isSurfaceEvent = SURFACE_TYPES.has(type);
  if ((isKnown && !validRecognizedData(type, data)) || (surfaceOp !== undefined) !== isSurfaceEvent) return null;
  if (!isSurfaceEvent && sourceEventSeqs !== undefined) return null;
  if (sourceEventSeqs?.some((sourceSeq) => sourceSeq >= seq)) return null;
  if (
    surfaceOp !== undefined &&
    surfaceOp !== null &&
    surfaceOp !== "append" &&
    (!sourceEventSeqs || !sourceEventSeqs.includes(surfaceOp.start) || !sourceEventSeqs.includes(surfaceOp.end))
  )
    return null;
  return {
    type,
    seq,
    time,
    data,
    ...(event.ignorable ? { ignorable: true } : {}),
    ...(surfaceOp ? { surfaceOp } : {}),
    ...(sourceEventSeqs ? { sourceEventSeqs } : {}),
  };
}
function parseStatus(input: unknown, sessionId: string): { sessionId: string; status: "idle" | "running" } | null {
  const status = exactRecord(input, ["sessionId", "status"]);
  const value = status?.status;
  return status && status.sessionId === sessionId && (value === "idle" || value === "running")
    ? { sessionId, status: value }
    : null;
}
function parseCursor(
  input: unknown,
  sessionId: string,
  instanceId: string,
): { sessionId: string; durableThroughSeq: number; instanceId: string } | null {
  const cursor = exactRecord(input, ["sessionId", "durableThroughSeq", "instanceId"]);
  const sequence = cursor && safeSequence(cursor.durableThroughSeq, -1);
  return cursor && cursor.sessionId === sessionId && cursor.instanceId === instanceId && sequence !== null
    ? { sessionId, instanceId, durableThroughSeq: sequence }
    : null;
}
function parseReset(
  input: unknown,
  sessionId: string,
  instanceId: string,
): { sessionId: string; instanceId: string; headSeq: number } | null {
  const reset = exactRecord(input, ["sessionId", "instanceId", "headSeq"]);
  const sequence = reset && safeSequence(reset.headSeq, -1);
  return reset && reset.sessionId === sessionId && reset.instanceId === instanceId && sequence !== null
    ? { sessionId, instanceId, headSeq: sequence }
    : null;
}
function parseLifecycle(input: unknown, sessionId: string, instanceId: string): DSHLifecycle | null {
  const lifecycle = asRecord(input);
  if (!lifecycle) return null;
  const hasStopReason = "stopReason" in lifecycle;
  if (
    !hasExactKeys(
      lifecycle,
      hasStopReason
        ? [
            "version",
            "parentSessionId",
            "instanceId",
            "revision",
            "event",
            "runId",
            "childSessionId",
            "provider",
            "local",
            "stopReason",
          ]
        : [
            "version",
            "parentSessionId",
            "instanceId",
            "revision",
            "event",
            "runId",
            "childSessionId",
            "provider",
            "local",
          ],
    )
  )
    return null;
  const isIdentityMatch = lifecycle.parentSessionId === sessionId && lifecycle.instanceId === instanceId;
  const hasRequiredValues =
    lifecycle.version === 1 &&
    safeSequence(lifecycle.revision, 0) !== null &&
    ["runId", "childSessionId", "provider"].every((key) => requiredString(lifecycle, key)) &&
    typeof lifecycle.local === "boolean";
  if (!isIdentityMatch || !hasRequiredValues) return null;
  if (lifecycle.event === "started" && !hasStopReason) return lifecycle as DSHLifecycle;
  if (
    lifecycle.event === "finished" &&
    typeof lifecycle.stopReason === "string" &&
    ["completed", "aborted", "error", "max-tokens", "refusal"].includes(lifecycle.stopReason)
  )
    return lifecycle as DSHLifecycle;
  return null;
}
function parseLifecycleResync(input: unknown, sessionId: string, instanceId: string): DSHLifecycleResync | null {
  const resync = exactRecord(input, ["parentSessionId", "instanceId", "revision"]);
  return resync &&
    resync.parentSessionId === sessionId &&
    resync.instanceId === instanceId &&
    safeSequence(resync.revision, 0) !== null
    ? (resync as DSHLifecycleResync)
    : null;
}
function parseSurfaceOp(input: unknown): SurfaceOp | null {
  if (input === "append") return input;
  const op = exactRecord(input, ["op", "start", "end"]);
  const start = op && safeSequence(op.start, 0);
  const end = op && safeSequence(op.end, 0);
  return op?.op === "replace" && start !== null && end !== null && start <= end ? { op: "replace", start, end } : null;
}
function parseSourceEventSeqs(input: unknown, canBeEmpty: boolean): number[] | null {
  if (!Array.isArray(input) || (!canBeEmpty && input.length === 0)) return null;
  const sequences = input.map((value) => safeSequence(value, 0));
  return sequences.some((value) => value === null) || new Set(sequences).size !== sequences.length
    ? null
    : (sequences as number[]);
}
function projectSurfaceMessage(event: DSHEvent): AgentMessage {
  if (event.type === "user/message") {
    const data = event.data;
    if (typeof data.id !== "string") throw new Error("DSH message is malformed");
    return { id: data.id, role: "user", content: contentText(data), timestamp: event.time };
  }
  const message = requiredMessage(event.data);
  if (event.type === "assistant/message")
    return {
      id: message.id,
      role: "assistant",
      content: contentBlocks(message),
      usage: usage(event.data.usage),
      ...(event.data.interrupted === true ? { stopReason: "interrupted" } : {}),
      timestamp: event.time,
    };
  const source = asRecord(message.source);
  const callId = source && requiredString(source, "callId");
  if (!callId) throw new Error("DSH tool result is missing callId");
  return {
    id: message.id,
    role: "toolResult",
    content: contentText(message),
    toolCallId: callId,
    isError: event.data.error !== undefined,
    timestamp: event.time,
  };
}
function requiredMessage(data: JsonRecord): JsonRecord & { id: string } {
  const message = asRecord(data.message);
  if (!message || typeof message.id !== "string") throw new Error("DSH message is malformed");
  return message as JsonRecord & { id: string };
}
function contentText(message: JsonRecord): string {
  if (!Array.isArray(message.content)) throw new Error("DSH message content is malformed");
  return message.content.flatMap(contentBlockText).join("");
}
function contentBlockText(block: unknown): string[] {
  const record = asRecord(block);
  if (!record) throw new Error("DSH content block is malformed");
  if ((record.type === "text" || record.type === "reasoning") && typeof record.text === "string") return [record.text];
  if (record.type === "tool-result" && Array.isArray(record.content)) return record.content.flatMap(contentBlockText);
  return [];
}
function contentBlocks(message: JsonRecord): AgentContentBlock[] {
  if (!Array.isArray(message.content)) throw new Error("DSH message content is malformed");
  return message.content.map(projectContentBlock);
}
function projectContentBlock(block: unknown): AgentContentBlock {
  const record = asRecord(block);
  if (!record) throw new Error("DSH content block is malformed");
  if (record.type === "text" && typeof record.text === "string") return { type: "text", text: record.text };
  if (record.type === "reasoning" && typeof record.text === "string")
    return { type: "thinking", thinking: record.text };
  if (
    record.type === "tool-call" &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.arguments === "string"
  )
    return { type: "toolCall", id: record.id, name: record.name, arguments: parseArguments(record.arguments) };
  throw new Error("DSH content block is malformed");
}
function parseArguments(input: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(input)) ?? {};
  } catch {
    return {};
  }
}
function usage(input: unknown): AgentMessage["usage"] | undefined {
  if (input === undefined) return undefined;
  const value = asRecord(input);
  if (!value) throw new Error("DSH usage is malformed");
  const inputTokens = finiteNumber(value.inputTokens);
  const outputTokens = finiteNumber(value.outputTokens);
  if (inputTokens === null || outputTokens === null) throw new Error("DSH usage is malformed");
  const cacheRead = finiteNumber(value.cacheReadTokens);
  const cacheWrite = finiteNumber(value.cacheWriteTokens);
  const reasoning = finiteNumber(value.reasoningTokens);
  return {
    input: inputTokens,
    output: outputTokens,
    ...(cacheRead === null ? {} : { cacheRead }),
    ...(cacheWrite === null ? {} : { cacheWrite }),
    ...(reasoning === null ? {} : { reasoning }),
    total: inputTokens + outputTokens + (cacheRead ?? 0) + (cacheWrite ?? 0),
  };
}
function asRecord(input: unknown): JsonRecord | null {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as JsonRecord) : null;
}
function exactRecord(input: unknown, keys: string[]): JsonRecord | null {
  const record = asRecord(input);
  return record && hasExactKeys(record, keys) ? record : null;
}
function hasExactKeys(record: JsonRecord, keys: string[]): boolean {
  return Object.keys(record).length === keys.length && hasOnlyKeys(record, keys);
}
function hasOnlyKeys(record: JsonRecord, keys: string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}
function requiredString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
function safeSequence(input: unknown, minimum: number): number | null {
  return typeof input === "number" && Number.isSafeInteger(input) && input >= minimum && input <= MAX_SAFE_SEQUENCE
    ? input
    : null;
}
function finiteNumber(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) ? input : null;
}
