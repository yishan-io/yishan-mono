import { parseDSHAttachResult } from "./daemonAgentAttachParser";
import type { AgentStartRequest, AgentStartResult } from "./daemonAgentTypes";

type WireRecord = Record<string, unknown>;

/** Parses a runtime-tagged start response and its required DSH v3 snapshot. */
export function parseAgentStartResult(payload: unknown, request: AgentStartRequest): AgentStartResult {
  const result = requireRecord(payload);
  const keys = Object.keys(result);
  const hasSnapshot = Object.hasOwn(result, "dshAttachSnapshot");
  if (request.runtime === "dsh" && !hasSnapshot) {
    throw new TypeError("DSH start result is missing its transcript snapshot");
  }
  const expectedKeys = request.runtime === "dsh" ? 3 : 2;
  if (
    keys.length !== expectedKeys ||
    keys.some((key) => !["runtime", "sessionId", "dshAttachSnapshot"].includes(key))
  ) {
    throw new TypeError("agent start result has unsupported fields");
  }
  if (result.runtime !== request.runtime || result.sessionId !== request.sessionId) {
    throw new TypeError("agent start result identity does not match request");
  }
  if (request.runtime === "pi") {
    if (hasSnapshot) throw new TypeError("Pi start result cannot contain a DSH snapshot");
    return { runtime: "pi", sessionId: request.sessionId };
  }
  return {
    runtime: "dsh",
    sessionId: request.sessionId,
    dshAttachSnapshot: parseDSHAttachResult(result.dshAttachSnapshot, request.sessionId),
  };
}

function requireRecord(payload: unknown): WireRecord {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("agent start result must be an object");
  }
  return payload as WireRecord;
}
