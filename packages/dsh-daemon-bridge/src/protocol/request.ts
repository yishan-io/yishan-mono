import { z } from "zod";

import { MAX_REQUEST_LIFETIME_MS } from "./capability";

const nonEmptyStringSchema = z.string().min(1);
const positiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/**
 * Interaction request wire shape.
 *
 * Unknown top-level fields are accepted then stripped so newer peers can add metadata
 * without breaking older bridges or allowing that metadata into interaction handling.
 */
const requestSchema = z
  .object({
    id: nonEmptyStringSchema,
    cancellationId: nonEmptyStringSchema,
    sessionId: nonEmptyStringSchema,
    workspaceId: nonEmptyStringSchema,
    generation: positiveSafeIntegerSchema,
    kind: z.enum(["approval", "selection", "input"], { error: "unsupported interaction kind" }),
    prompt: nonEmptyStringSchema,
    choices: z.array(nonEmptyStringSchema),
    deadlineAtMs: positiveSafeIntegerSchema,
  })
  .strip();

/** One correlated, bounded DSH interaction request. */
type InteractionRequest = z.infer<typeof requestSchema>;

/** Parses an interaction request before it crosses the daemon trust boundary. */
export function parseInteractionRequest(payload: unknown, nowMs = Date.now()): InteractionRequest {
  const request = requestSchema.parse(payload);
  if (request.deadlineAtMs <= nowMs || request.deadlineAtMs - nowMs > MAX_REQUEST_LIFETIME_MS) {
    throw new TypeError("deadlineAtMs must be within the allowed request lifetime");
  }
  return request;
}
