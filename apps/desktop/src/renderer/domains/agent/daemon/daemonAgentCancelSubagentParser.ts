import type { AgentCancelSubagentRequest, AgentCancelSubagentResult } from "./daemonAgentTypes";

type WireRecord = Record<string, unknown>;

/** Parses the exact DSH subagent-cancellation receipt for the requested child. */
export function parseAgentCancelSubagentResult(
  payload: unknown,
  request: AgentCancelSubagentRequest,
): AgentCancelSubagentResult {
  const receipt = requireExactRecord(payload, "agent cancel subagent result", [
    "runtime",
    "parentSessionId",
    "childSessionId",
    "interruptRequested",
  ]);
  if (receipt.runtime !== "dsh") throw new TypeError("cancel subagent runtime must be dsh");
  if (receipt.parentSessionId !== request.parentSessionId) {
    throw new TypeError("cancel subagent parentSessionId does not match request");
  }
  if (receipt.childSessionId !== request.childSessionId) {
    throw new TypeError("cancel subagent childSessionId does not match request");
  }
  if (typeof receipt.interruptRequested !== "boolean") {
    throw new TypeError("cancel subagent interruptRequested must be a boolean");
  }
  return {
    runtime: "dsh",
    parentSessionId: request.parentSessionId,
    childSessionId: request.childSessionId,
    interruptRequested: receipt.interruptRequested,
  };
}

function requireExactRecord(payload: unknown, name: string, keys: readonly string[]): WireRecord {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError(`${name} must be an object`);
  }
  const record = payload as WireRecord;
  if (Object.keys(record).length !== keys.length || Object.keys(record).some((key) => !keys.includes(key))) {
    throw new TypeError(`${name} has unsupported fields`);
  }
  return record;
}
