import { z } from "zod";

const nonEmptyStringSchema = z.string().min(1);

/**
 * Interaction response wire shape.
 *
 * Unknown top-level fields are accepted then stripped so newer peers can add metadata
 * without breaking older bridges or allowing that metadata into decision handling.
 */
const responseSchema = z
  .object({
    id: nonEmptyStringSchema,
    outcome: z.enum(["accepted", "denied", "cancelled", "timed-out"], {
      error: "unsupported interaction outcome",
    }),
    value: z.string().nullable(),
  })
  .strip()
  .refine((response) => response.outcome === "accepted" || response.value === null, {
    error: "non-accepted interaction responses cannot carry a value",
  });

/** Fail-closed result returned for one correlated interaction request. */
type InteractionResponse = z.infer<typeof responseSchema>;

/** Parses a daemon interaction decision without inferring a grant. */
export function parseInteractionResponse(payload: unknown): InteractionResponse {
  return responseSchema.parse(payload);
}
