import { KNOWN_SESSION_EVENT_TYPES, type SessionEvent } from "@deepseek-ai/dsh-session";

import {
  type WireRecord,
  requireExactRecord,
  requireNonEmptyString,
  requireSafeIntegerAtLeast,
} from "./wireValidation";

declare module "@deepseek-ai/dsh-session" {
  interface SessionEventMap {
    "yishan/session-bound.v1": SessionBoundData;
    "yishan/session-summary.v1": SessionSummaryData;
    "yishan/session-title.v1": SessionTitleData;
  }
}

/** Durable workspace ownership record appended as the first Yishan session event. */
export type SessionBoundData = {
  version: 1;
  workspaceId: string;
  projectId: string;
  organizationId: string;
  ownerNodeId: string;
  cwd: string;
};

/** Durable generated session summary record. */
export type SessionSummaryData = {
  version: 1;
  sourceSeq: number;
  provider: string;
  model: string;
  title: string;
  summary: string;
  generationUsage: SessionGenerationUsage;
};

/** Token usage attributed to session summary generation. */
export type SessionGenerationUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
};

/** Durable session title record. */
export type SessionTitleData = {
  version: 1;
  sourceSeq: number;
  idempotencyKey: string;
  origin: "manual" | "auto";
  title: string;
};

/** Registers Yishan's required event types with the rc.2 persistence reader. */
export function registerYishanSessionEventTypes(): void {
  if (!(KNOWN_SESSION_EVENT_TYPES instanceof Set)) return;
  const knownEventTypes = KNOWN_SESSION_EVENT_TYPES as Set<string>;
  knownEventTypes.add("yishan/session-bound.v1");
  knownEventTypes.add("yishan/session-summary.v1");
  knownEventTypes.add("yishan/session-title.v1");
}

/** Parses the exact data payload for a session-bound event. */
export function parseSessionBoundData(payload: unknown): SessionBoundData {
  const bound = requireExactRecord(payload, "session bound data", [
    "version",
    "workspaceId",
    "projectId",
    "organizationId",
    "ownerNodeId",
    "cwd",
  ]);
  return {
    version: requireVersion(bound),
    workspaceId: requireNonEmptyString(bound, "workspaceId"),
    projectId: requireString(bound, "projectId"),
    organizationId: requireString(bound, "organizationId"),
    ownerNodeId: requireNonEmptyString(bound, "ownerNodeId"),
    cwd: requireNonEmptyString(bound, "cwd"),
  };
}

/** Parses the exact data payload for a session-summary event. */
export function parseSessionSummaryData(payload: unknown): SessionSummaryData {
  const summary = requireExactRecord(payload, "session summary data", [
    "version",
    "sourceSeq",
    "provider",
    "model",
    "title",
    "summary",
    "generationUsage",
  ]);
  return {
    version: requireVersion(summary),
    sourceSeq: requireSafeIntegerAtLeast(summary, "sourceSeq", 0),
    provider: requireNonEmptyString(summary, "provider"),
    model: requireNonEmptyString(summary, "model"),
    title: requireNonEmptyString(summary, "title"),
    summary: requireNonEmptyString(summary, "summary"),
    generationUsage: parseSessionGenerationUsage(summary.generationUsage),
  };
}

/** Parses the exact data payload for a session-title event. */
export function parseSessionTitleData(payload: unknown): SessionTitleData {
  const title = requireExactRecord(payload, "session title data", [
    "version",
    "sourceSeq",
    "idempotencyKey",
    "origin",
    "title",
  ]);
  if (title.origin !== "manual" && title.origin !== "auto") throw new TypeError('origin must be "manual" or "auto"');
  return {
    version: requireVersion(title),
    sourceSeq: requireSafeIntegerAtLeast(title, "sourceSeq", 0),
    idempotencyKey: requireNonEmptyString(title, "idempotencyKey"),
    origin: title.origin,
    title: requireNonEmptyString(title, "title"),
  };
}

/** Returns whether an event is a strictly valid Yishan session-bound event. */
export function isYishanSessionBoundEvent(
  event: unknown,
): event is SessionEvent & { type: "yishan/session-bound.v1"; data: SessionBoundData } {
  return isYishanEvent(event, "yishan/session-bound.v1", parseSessionBoundData);
}

/** Returns whether an event is a strictly valid Yishan session-summary event. */
export function isYishanSessionSummaryEvent(
  event: unknown,
): event is SessionEvent & { type: "yishan/session-summary.v1"; data: SessionSummaryData } {
  return isYishanEvent(event, "yishan/session-summary.v1", parseSessionSummaryData);
}

/** Returns whether an event is a strictly valid Yishan session-title event. */
export function isYishanSessionTitleEvent(
  event: unknown,
): event is SessionEvent & { type: "yishan/session-title.v1"; data: SessionTitleData } {
  return isYishanEvent(event, "yishan/session-title.v1", parseSessionTitleData);
}

function parseSessionGenerationUsage(payload: unknown): SessionGenerationUsage {
  const usage = requireExactRecord(
    payload,
    "generationUsage",
    ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"].filter(
      (key) => payload !== null && typeof payload === "object" && key in payload,
    ),
  );
  return {
    inputTokens: requireSafeIntegerAtLeast(usage, "inputTokens", 0),
    outputTokens: requireSafeIntegerAtLeast(usage, "outputTokens", 0),
    ...optionalUsageTokens(usage, "cacheReadTokens"),
    ...optionalUsageTokens(usage, "cacheWriteTokens"),
    ...optionalUsageTokens(usage, "reasoningTokens"),
  };
}

function optionalUsageTokens(
  usage: WireRecord,
  field: keyof Omit<SessionGenerationUsage, "inputTokens" | "outputTokens">,
) {
  return usage[field] === undefined ? {} : { [field]: requireSafeIntegerAtLeast(usage, field, 0) };
}

function isYishanEvent<T>(event: unknown, type: string, parseData: (payload: unknown) => T): boolean {
  if (event === null || typeof event !== "object" || Array.isArray(event)) return false;
  const sessionEvent = event as WireRecord;
  if (sessionEvent.type !== type) return false;
  try {
    parseData(sessionEvent.data);
    return true;
  } catch {
    return false;
  }
}

function requireVersion(record: WireRecord): 1 {
  if (record.version !== 1) throw new TypeError("version must equal 1");
  return 1;
}

function requireString(record: WireRecord, field: string): string {
  if (typeof record[field] !== "string") throw new TypeError(`${field} must be a string`);
  return record[field];
}
