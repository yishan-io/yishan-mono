import { z } from "zod";

/** Longest capability or interaction request lifetime accepted on the wire. */
export const MAX_REQUEST_LIFETIME_MS = 5 * 60 * 1_000;

const nonEmptyStringSchema = z.string().min(1);
const positiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/**
 * Capability request wire shape.
 *
 * Unknown top-level fields are accepted then stripped so newer peers can add metadata
 * without breaking older bridges or allowing that metadata into authorization handling.
 */
const capabilityRequestSchema = z
  .object({
    id: nonEmptyStringSchema,
    cancellationId: nonEmptyStringSchema,
    sessionId: nonEmptyStringSchema,
    workspaceId: nonEmptyStringSchema,
    workspaceGeneration: positiveSafeIntegerSchema,
    deadlineAtMs: positiveSafeIntegerSchema,
    operation: nonEmptyStringSchema,
    input: z.record(z.string(), z.unknown()),
  })
  .strip();

/** A DSH request for a daemon-authorized Yishan capability. */
type CapabilityRequest = z.infer<typeof capabilityRequestSchema>;

/** Parses the authority context required for every daemon capability call. */
export function parseCapabilityRequest(payload: unknown, nowMs = Date.now()): CapabilityRequest {
  const request = capabilityRequestSchema.parse(payload);
  if (request.deadlineAtMs <= nowMs || request.deadlineAtMs - nowMs > MAX_REQUEST_LIFETIME_MS) {
    throw new TypeError("deadlineAtMs must be within the allowed request lifetime");
  }
  return request;
}
