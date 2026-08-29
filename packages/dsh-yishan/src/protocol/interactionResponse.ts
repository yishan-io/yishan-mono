import { requireExactRecord, requireNonEmptyString } from "../shared/validation";

/** Fail-closed result returned for one correlated interaction request. */
export type InteractionResponse = {
  id: string;
  outcome: "accepted" | "denied" | "cancelled" | "timed-out";
  value: string | null;
};

/** Parses a daemon interaction decision without inferring a grant. */
export function parseInteractionResponse(payload: unknown): InteractionResponse {
  const response = requireExactRecord(payload, "interaction response", ["id", "outcome", "value"]);
  if (
    response.outcome !== "accepted" &&
    response.outcome !== "denied" &&
    response.outcome !== "cancelled" &&
    response.outcome !== "timed-out"
  ) {
    throw new TypeError("unsupported interaction outcome");
  }
  if (response.value !== null && typeof response.value !== "string") {
    throw new TypeError("interaction value must be a string or null");
  }
  if (response.outcome !== "accepted" && response.value !== null) {
    throw new TypeError("non-accepted interaction responses cannot carry a value");
  }
  return { id: requireNonEmptyString(response, "id"), outcome: response.outcome, value: response.value };
}
