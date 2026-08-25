import { requireExactRecord, requireNonEmptyString } from "./wireValidation";

/** Durable replay boundary for one DSH session and runtime incarnation. */
export type DurableCursor = {
  sessionId: string;
  durableThroughSeq: number;
  incarnation: string;
};

/** Parses a durability acknowledgement emitted after DSH persistence flushes. */
export function parseDurableCursor(payload: unknown): DurableCursor {
  const cursor = requireExactRecord(payload, "durable cursor", ["sessionId", "durableThroughSeq", "incarnation"]);
  const durableThroughSeq = cursor.durableThroughSeq;
  if (typeof durableThroughSeq !== "number" || !Number.isSafeInteger(durableThroughSeq) || durableThroughSeq < 0) {
    throw new TypeError("durableThroughSeq must be a non-negative safe integer");
  }
  return {
    sessionId: requireNonEmptyString(cursor, "sessionId"),
    durableThroughSeq,
    incarnation: requireNonEmptyString(cursor, "incarnation"),
  };
}
