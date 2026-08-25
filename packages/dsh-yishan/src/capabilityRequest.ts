import { requireExactRecord, requireNonEmptyString, requirePositiveSafeInteger } from "./wireValidation";

/** Longest capability or interaction request lifetime accepted on the wire. */
export const MAX_REQUEST_LIFETIME_MS = 5 * 60 * 1_000;

/** A DSH request for a daemon-authorized Yishan capability. */
export type CapabilityRequest = {
  id: string;
  cancellationId: string;
  sessionId: string;
  workspaceId: string;
  workspaceGeneration: number;
  deadlineAtMs: number;
  operation: string;
  input: Record<string, unknown>;
};

/** Parses the authority context required for every daemon capability call. */
export function parseCapabilityRequest(payload: unknown, nowMs = Date.now()): CapabilityRequest {
  const request = requireExactRecord(payload, "capability request", [
    "id",
    "cancellationId",
    "sessionId",
    "workspaceId",
    "workspaceGeneration",
    "deadlineAtMs",
    "operation",
    "input",
  ]);
  const deadlineAtMs = requirePositiveSafeInteger(request, "deadlineAtMs");
  if (deadlineAtMs <= nowMs || deadlineAtMs - nowMs > MAX_REQUEST_LIFETIME_MS) {
    throw new TypeError("deadlineAtMs must be within the allowed request lifetime");
  }
  if (request.input === null || typeof request.input !== "object" || Array.isArray(request.input)) {
    throw new TypeError("input must be an object");
  }
  return {
    id: requireNonEmptyString(request, "id"),
    cancellationId: requireNonEmptyString(request, "cancellationId"),
    sessionId: requireNonEmptyString(request, "sessionId"),
    workspaceId: requireNonEmptyString(request, "workspaceId"),
    workspaceGeneration: requirePositiveSafeInteger(request, "workspaceGeneration"),
    deadlineAtMs,
    operation: requireNonEmptyString(request, "operation"),
    input: request.input as Record<string, unknown>,
  };
}
