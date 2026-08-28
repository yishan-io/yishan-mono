import type { SessionEvent } from "@deepseek-ai/dsh-session";

import { requireExactRecord, requireNonEmptyString } from "./wireValidation";

/** Workspace-scoped request to list top-level persisted DSH sessions. */
export type SessionListRequest = {
  cwd: string;
};

/** One top-level DSH session visible in the current workspace. */
export type SessionListEntry = {
  sessionId: string;
  createdAt: number;
  parentSession?: string;
  agentPreset?: string;
  live: boolean;
  persisted: boolean;
};

/** Workspace-scoped result of listing top-level persisted DSH sessions. */
export type SessionListResult = {
  sessions: SessionListEntry[];
};

/** Workspace-scoped request to enumerate DSH-native subagent lineage. */
export type SessionLineageRequest = {
  cwd: string;
  rootSessionId: string;
  mode: "children" | "descendants";
};

/** One DSH-native subagent below a requested lineage root. */
export type SessionLineageEntry = {
  sessionId: string;
  parentSessionId: string;
  origin: "subagent";
  delegationDepth: number;
  relativeDepth: number;
  live: boolean;
  persisted: boolean;
  activity?: "running" | "inactive";
  mode?: "one-shot" | "continuable";
  label?: string;
};

/** Deterministic DSH-native lineage below a root session. */
export type SessionLineageResult = {
  rootSessionId: string;
  mode: SessionLineageRequest["mode"];
  children: SessionLineageEntry[];
};

/** Workspace-scoped request to read one DSH session. */
export type SessionReadRequest = {
  cwd: string;
  sessionId: string;
};

/** Stable session header data exposed through Yishan's session protocol. */
export type SessionHeaderResult = {
  sessionId: string;
  createdAt: number;
  parentSession?: string;
  agentPreset?: string;
};

/** Workspace-scoped result of reading one DSH session. */
export type SessionReadResult = {
  session: SessionHeaderResult;
  events: readonly SessionEvent[];
  incarnation: string;
  asOfSeq: number;
  durableThroughSeq: number;
};

/** Workspace-scoped request to resume one DSH session. */
export type SessionResumeRequest = SessionReadRequest;

/** Workspace-scoped request to dispose one live DSH session. */
export type SessionDisposeRequest = SessionReadRequest;

/** Result of disposing a live DSH session. */
export type SessionDisposeResult = {
  sessionId: string;
  disposed: boolean;
};

/** Workspace-scoped result of resuming one DSH session. */
export type SessionResumeResult = {
  sessionId: string;
};

/** Parses an exact workspace-scoped session list request. */
export function parseSessionListRequest(payload: unknown): SessionListRequest {
  const request = requireExactRecord(payload, "session list request", ["cwd"]);
  return { cwd: requireNonEmptyString(request, "cwd") };
}

/** Parses an exact DSH-native subagent lineage request. */
export function parseSessionLineageRequest(payload: unknown): SessionLineageRequest {
  const request = requireExactRecord(payload, "session lineage request", ["cwd", "rootSessionId", "mode"]);
  const mode = request.mode;
  if (mode !== "children" && mode !== "descendants") throw new TypeError("mode must be children or descendants");
  return {
    cwd: requireNonEmptyString(request, "cwd"),
    rootSessionId: requireNonEmptyString(request, "rootSessionId"),
    mode,
  };
}

/** Parses an exact workspace-scoped session read request. */
export function parseSessionReadRequest(payload: unknown): SessionReadRequest {
  return parseSessionRequest(payload, "session read request");
}

/** Parses an exact workspace-scoped session resume request. */
export function parseSessionResumeRequest(payload: unknown): SessionResumeRequest {
  return parseSessionRequest(payload, "session resume request");
}

/** Parses an exact workspace-scoped session dispose request. */
export function parseSessionDisposeRequest(payload: unknown): SessionDisposeRequest {
  return parseSessionRequest(payload, "session dispose request");
}

function parseSessionRequest(payload: unknown, name: string): SessionReadRequest {
  const request = requireExactRecord(payload, name, ["cwd", "sessionId"]);
  return {
    cwd: requireNonEmptyString(request, "cwd"),
    sessionId: requireNonEmptyString(request, "sessionId"),
  };
}
