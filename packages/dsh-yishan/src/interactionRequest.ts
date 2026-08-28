import { MAX_REQUEST_LIFETIME_MS } from "./capabilityRequest";
import { requireExactRecord, requireNonEmptyString, requirePositiveSafeInteger } from "./wireValidation";

/** Interaction kinds that must be answered by daemon policy or desktop UI. */
export type InteractionKind = "approval" | "selection" | "input";

/** One correlated, bounded DSH interaction request. */
export type InteractionRequest = {
  id: string;
  cancellationId: string;
  sessionId: string;
  workspaceId: string;
  workspaceGeneration: number;
  kind: InteractionKind;
  prompt: string;
  choices: string[];
  deadlineAtMs: number;
};

/** Parses an interaction request before it crosses the daemon trust boundary. */
export function parseInteractionRequest(payload: unknown, nowMs = Date.now()): InteractionRequest {
  const request = requireExactRecord(payload, "interaction request", [
    "id",
    "cancellationId",
    "sessionId",
    "workspaceId",
    "workspaceGeneration",
    "kind",
    "prompt",
    "choices",
    "deadlineAtMs",
  ]);
  if (request.kind !== "approval" && request.kind !== "selection" && request.kind !== "input") {
    throw new TypeError("unsupported interaction kind");
  }
  if (
    !Array.isArray(request.choices) ||
    request.choices.some((choice) => typeof choice !== "string" || choice.length === 0)
  ) {
    throw new TypeError("choices must contain non-empty strings");
  }
  const deadlineAtMs = requirePositiveSafeInteger(request, "deadlineAtMs");
  if (deadlineAtMs <= nowMs || deadlineAtMs - nowMs > MAX_REQUEST_LIFETIME_MS) {
    throw new TypeError("deadlineAtMs must be within the allowed request lifetime");
  }
  return {
    id: requireNonEmptyString(request, "id"),
    cancellationId: requireNonEmptyString(request, "cancellationId"),
    sessionId: requireNonEmptyString(request, "sessionId"),
    workspaceId: requireNonEmptyString(request, "workspaceId"),
    workspaceGeneration: requirePositiveSafeInteger(request, "workspaceGeneration"),
    kind: request.kind,
    prompt: requireNonEmptyString(request, "prompt"),
    choices: request.choices,
    deadlineAtMs,
  };
}
