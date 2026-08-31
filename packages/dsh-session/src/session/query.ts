import type { SessionEvent } from "@deepseek-ai/dsh-session";

import type {
  SessionExecutionRequest,
  SessionLineageRequest,
  SessionListRequest,
  SessionResumeRequest,
} from "./schemas";

export type { SessionLineageRequest, SessionListRequest, SessionResumeRequest };

/** One top-level DSH session visible in the current workspace. */
export type SessionListEntry = {
  sessionId: string;
  createdAt: number;
  parentSession?: string;
  agentPreset?: string;
  sessionName?: string;
  live: boolean;
  persisted: boolean;
};

/** Workspace-scoped result of listing top-level persisted DSH sessions. */
export type SessionListResult = {
  sessions: SessionListEntry[];
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
export type SessionReadRequest = SessionExecutionRequest;

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
  instanceId: string;
  asOfSeq: number;
  durableThroughSeq: number;
  /** Absolute JSONL artifact path, or empty when no durable artifact exists. */
  filePath: string;
};

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
