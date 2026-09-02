import type { AgentAttachRequest, AgentAttachResult, AgentDSHAttachResult } from "./daemonAgentTypes";

type WireRecord = Record<string, unknown>;

/** Parses the runtime-tagged attach response before a controller applies it. */
export function parseAgentAttachResult(payload: unknown, request: AgentAttachRequest): AgentAttachResult {
  const result = requireRecord(payload, "agent attach result");
  if (result.runtime !== request.runtime) throw new TypeError("attach runtime does not match request");
  if (request.runtime === "pi") return parsePiAttach(result);
  return parseDSHAttachResult(result, request.sessionId);
}

function parsePiAttach(result: WireRecord): AgentAttachResult {
  requireExactKeys(result, ["runtime", "ok"]);
  if (result.runtime !== "pi" || result.ok !== true) throw new TypeError("invalid Pi attach result");
  return { runtime: "pi", ok: true };
}

/** Parses a DSH attach snapshot embedded in an attach or start response. */
export function parseDSHAttachResult(payload: unknown, sessionId: string): AgentDSHAttachResult {
  const result = requireRecord(payload, "DSH attach result");
  requireExactKeys(result, ["runtime", "sessionId", "instanceId", "events", "asOfSeq", "durableThroughSeq", "headSeq"]);
  if (
    result.runtime !== "dsh" ||
    result.sessionId !== sessionId ||
    !isNonEmptyString(result.instanceId) ||
    !Array.isArray(result.events)
  ) {
    throw new TypeError("invalid DSH attach result identity");
  }
  const asOfSeq = requireSequence(result.asOfSeq, "asOfSeq", -1);
  const durableThroughSeq = requireSequence(result.durableThroughSeq, "durableThroughSeq", -1);
  const headSeq = requireSequence(result.headSeq, "headSeq", -1);
  if (asOfSeq !== durableThroughSeq || headSeq < durableThroughSeq)
    throw new TypeError("invalid DSH attach result cursors");
  return {
    runtime: "dsh",
    sessionId,
    instanceId: result.instanceId,
    events: result.events,
    asOfSeq,
    durableThroughSeq,
    headSeq,
  };
}

function requireRecord(payload: unknown, name: string): WireRecord {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    throw new TypeError(`${name} must be an object`);
  return payload as WireRecord;
}
function requireExactKeys(record: WireRecord, keys: string[]): void {
  if (Object.keys(record).length !== keys.length || Object.keys(record).some((key) => !keys.includes(key))) {
    throw new TypeError("agent attach result has unsupported fields");
  }
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function requireSequence(value: unknown, name: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be a safe sequence`);
  }
  return value;
}
