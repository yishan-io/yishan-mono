import type {
  AgentListSessionLineageRequest,
  AgentSessionLineageEntry,
  AgentSessionLineageResult,
} from "./daemonAgentTypes";

type WireRecord = Record<string, unknown>;

/** Parses the exact DSH lineage response for the requested root session. */
export function parseAgentSessionLineageResult(
  payload: unknown,
  request: AgentListSessionLineageRequest,
): AgentSessionLineageResult {
  const result = requireExactRecord(payload, "agent session lineage result", [
    "runtime",
    "rootSessionId",
    "mode",
    "children",
  ]);
  if (result.runtime !== "dsh") throw new TypeError("lineage runtime must be dsh");
  if (result.rootSessionId !== request.rootSessionId)
    throw new TypeError("lineage rootSessionId does not match request");
  if (result.mode !== request.mode) throw new TypeError("lineage mode does not match request");
  if (!Array.isArray(result.children)) throw new TypeError("lineage children must be an array");
  return {
    runtime: "dsh",
    rootSessionId: request.rootSessionId,
    mode: request.mode,
    children: result.children.map(parseLineageEntry),
  };
}

function parseLineageEntry(payload: unknown): AgentSessionLineageEntry {
  const entry = requireAllowedRecord(payload, "lineage entry", [
    "sessionId",
    "parentSessionId",
    "origin",
    "delegationDepth",
    "relativeDepth",
    "live",
    "persisted",
    "activity",
    "mode",
    "label",
  ]);
  const activity = requireOptionalEnum(entry.activity, "activity", ["running", "inactive"]);
  const mode = requireOptionalEnum(entry.mode, "mode", ["one-shot", "continuable"]);
  const label = requireOptionalNonEmptyString(entry.label, "label");
  return {
    sessionId: requireNonEmptyString(entry.sessionId, "sessionId"),
    parentSessionId: requireNonEmptyString(entry.parentSessionId, "parentSessionId"),
    origin: requireEnum(entry.origin, "origin", ["subagent"]),
    delegationDepth: requireSafeIntegerAtLeast(entry.delegationDepth, "delegationDepth", 0),
    relativeDepth: requireSafeIntegerAtLeast(entry.relativeDepth, "relativeDepth", 1),
    live: requireBoolean(entry.live, "live"),
    persisted: requireBoolean(entry.persisted, "persisted"),
    ...(activity === undefined ? {} : { activity }),
    ...(mode === undefined ? {} : { mode }),
    ...(label === undefined ? {} : { label }),
  };
}

function requireExactRecord(payload: unknown, name: string, keys: readonly string[]): WireRecord {
  const record = requireAllowedRecord(payload, name, keys);
  if (Object.keys(record).length !== keys.length) throw new TypeError(`${name} has unsupported fields`);
  return record;
}

function requireAllowedRecord(payload: unknown, name: string, keys: readonly string[]): WireRecord {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError(`${name} must be an object`);
  }
  const record = payload as WireRecord;
  if (Object.keys(record).some((key) => !keys.includes(key))) throw new TypeError(`${name} has unsupported fields`);
  return record;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${name} is required`);
  return value;
}

function requireOptionalNonEmptyString(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : requireNonEmptyString(value, name);
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${name} must be a boolean`);
  return value;
}

function requireEnum<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  const matchedValue = typeof value === "string" ? values.find((allowedValue) => allowedValue === value) : undefined;
  if (matchedValue === undefined) throw new TypeError(`${name} is invalid`);
  return matchedValue;
}

function requireOptionalEnum<T extends string>(value: unknown, name: string, values: readonly T[]): T | undefined {
  return value === undefined ? undefined : requireEnum(value, name, values);
}

function requireSafeIntegerAtLeast(value: unknown, name: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
  return value;
}
