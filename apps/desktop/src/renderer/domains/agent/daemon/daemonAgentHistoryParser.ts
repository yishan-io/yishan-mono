import type { AgentDSHHistory, AgentHistoryResult, AgentPiHistory, AgentReadHistoryRequest } from "./daemonAgentTypes";

type WireRecord = Record<string, unknown>;

/** Parses the exact runtime-tagged durable history response for one requested agent session. */
export function parseAgentHistoryResult(payload: unknown, request: AgentReadHistoryRequest): AgentHistoryResult {
  const result = requireExactRecord(payload, "agent history result", ["runtime", request.runtime]);
  if (result.runtime !== request.runtime) throw new TypeError("history runtime does not match request");
  return request.runtime === "dsh" ? parseDSHHistory(result.dsh, request.sessionId) : parsePiHistory(result.pi);
}

function parseDSHHistory(payload: unknown, requestedSessionId: string): AgentHistoryResult {
  const dsh = requireExactRecord(payload, "DSH history", [
    "session",
    "events",
    "instanceId",
    "asOfSeq",
    "durableThroughSeq",
  ]);
  const session = parseDSHSession(dsh.session, requestedSessionId);
  if (!Array.isArray(dsh.events)) throw new TypeError("DSH history events must be an array");
  const events = dsh.events.map((event, index) => parseDSHEvent(event, index));
  const asOfSeq = requireSafeIntegerAtLeast(dsh.asOfSeq, "asOfSeq", -1);
  const durableThroughSeq = requireSafeIntegerAtLeast(dsh.durableThroughSeq, "durableThroughSeq", -1);
  if (asOfSeq !== durableThroughSeq) throw new TypeError("DSH history cursors must match");
  if (events.length - 1 !== durableThroughSeq) throw new TypeError("DSH history cursor must match durable events");
  return {
    runtime: "dsh",
    dsh: {
      session,
      events,
      instanceId: requireNonEmptyString(dsh.instanceId, "instanceId"),
      asOfSeq,
      durableThroughSeq,
    },
  };
}

function parsePiHistory(payload: unknown): AgentHistoryResult {
  const pi = requireExactRecord(payload, "Pi history", ["filePath"]);
  const filePath = pi.filePath;
  if (typeof filePath !== "string") throw new TypeError("filePath must be a string");
  const parsedPi: AgentPiHistory = { filePath };
  return { runtime: "pi", pi: parsedPi };
}

function parseDSHSession(payload: unknown, requestedSessionId: string): AgentDSHHistory["session"] {
  const session = requireAllowedRecord(payload, "DSH session", [
    "sessionId",
    "createdAt",
    "parentSession",
    "agentPreset",
  ]);
  const sessionId = requireNonEmptyString(session.sessionId, "sessionId");
  if (sessionId !== requestedSessionId) throw new TypeError("sessionId does not match requested session");
  const createdAt = requireSafeIntegerAtLeast(session.createdAt, "createdAt", 0);
  const parentSession = requireOptionalString(session.parentSession, "parentSession");
  const agentPreset = requireOptionalString(session.agentPreset, "agentPreset");
  return {
    sessionId,
    createdAt,
    ...(parentSession === undefined ? {} : { parentSession }),
    ...(agentPreset === undefined ? {} : { agentPreset }),
  };
}

function parseDSHEvent(payload: unknown, expectedSeq: number): unknown {
  const event = requireAllowedRecord(payload, "DSH event", [
    "type",
    "seq",
    "time",
    "data",
    "ignorable",
    "sourceEventSeqs",
    "surfaceOp",
  ]);
  if (requireNonEmptyString(event.type, "event type").length === 0) throw new TypeError("event type is required");
  if (requireSafeIntegerAtLeast(event.seq, "event seq", 0) !== expectedSeq)
    throw new TypeError("DSH events must be contiguous");
  requireSafeIntegerAtLeast(event.time, "event time", 0);
  if (!("data" in event)) throw new TypeError("event data is required");
  return payload;
}

function requireExactRecord(payload: unknown, name: string, keys: readonly string[]): WireRecord {
  const record = requireAllowedRecord(payload, name, keys);
  if (Object.keys(record).length !== keys.length) throw new TypeError(`${name} has unsupported fields`);
  return record;
}

function requireAllowedRecord(payload: unknown, name: string, keys: readonly string[]): WireRecord {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    throw new TypeError(`${name} must be an object`);
  const record = payload as WireRecord;
  if (Object.keys(record).some((key) => !keys.includes(key))) throw new TypeError(`${name} has unsupported fields`);
  return record;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${name} is required`);
  return value;
}

function requireOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  return requireNonEmptyString(value, name);
}

function requireSafeIntegerAtLeast(value: unknown, name: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
  return value;
}
