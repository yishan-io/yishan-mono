import type {
  SessionCancelRequest,
  SessionFlushRequest,
  SessionPromptRequest,
  SessionStartRequest,
  SessionSubscribeRequest,
  SetModelRequest,
} from "./protocol";
import type {
  SessionDisposeRequest,
  SessionFilePathRequest,
  SessionLineageRequest,
  SessionListRequest,
  SessionReadRequest,
  SessionResumeRequest,
} from "./query";
import {
  sessionExecutionRequestSchema,
  sessionLineageRequestSchema,
  sessionListRequestSchema,
  sessionPromptRequestSchema,
  sessionResumeRequestSchema,
  sessionStartRequestSchema,
  sessionSubscribeRequestSchema,
  setModelRequestSchema,
} from "./schemas";

/** Parses a Yishan session start request from untrusted bridge parameters. */
export function parseSessionStartRequest(payload: unknown): SessionStartRequest {
  return sessionStartRequestSchema.parse(payload);
}
/** Parses a Yishan session prompt request from untrusted bridge parameters. */
export function parseSessionPromptRequest(payload: unknown): SessionPromptRequest {
  return sessionPromptRequestSchema.parse(payload);
}
/** Parses a Yishan session model-selection request from untrusted bridge parameters. */
export function parseSetModelRequest(payload: unknown): SetModelRequest {
  return setModelRequestSchema.parse(payload);
}
/** Parses a simple session execution request. */
export function parseSessionCancelRequest(payload: unknown): SessionCancelRequest {
  return sessionExecutionRequestSchema.parse(payload);
}
/** Parses a simple session flush request. */
export function parseSessionFlushRequest(payload: unknown): SessionFlushRequest {
  return sessionExecutionRequestSchema.parse(payload);
}
/** Parses a session replay request. */
export function parseSessionSubscribeRequest(payload: unknown): SessionSubscribeRequest {
  return sessionSubscribeRequestSchema.parse(payload);
}
/** Parses a session resume request. */
export function parseSessionResumeRequest(payload: unknown): SessionResumeRequest {
  return sessionResumeRequestSchema.parse(payload);
}
/** Parses a session dispose request. */
export function parseSessionDisposeRequest(payload: unknown): SessionDisposeRequest {
  return sessionExecutionRequestSchema.parse(payload);
}
/** Parses a session read request. */
export function parseSessionReadRequest(payload: unknown): SessionReadRequest {
  return sessionExecutionRequestSchema.parse(payload);
}
/** Parses a session artifact-path request. */
export function parseSessionFilePathRequest(payload: unknown): SessionFilePathRequest {
  return sessionExecutionRequestSchema.parse(payload);
}
/** Parses a workspace-scoped session-list request. */
export function parseSessionListRequest(payload: unknown): SessionListRequest {
  return sessionListRequestSchema.parse(payload);
}
/** Parses a session lineage request. */
export function parseSessionLineageRequest(payload: unknown): SessionLineageRequest {
  return sessionLineageRequestSchema.parse(payload);
}
