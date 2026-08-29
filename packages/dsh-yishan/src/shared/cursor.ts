import { requireExactRecord, requireNonEmptyString, requireSafeIntegerAtLeast } from "./validation";

/** Durable replay boundary for one DSH session and runtime instance ID. */
export type DurableCursor = {
  sessionId: string;
  durableThroughSeq: number;
  instanceId: string;
};

/** Parses a durability acknowledgement emitted after DSH persistence flushes. */
export function parseDurableCursor(payload: unknown): DurableCursor {
  const cursor = requireExactRecord(payload, "durable cursor", ["sessionId", "durableThroughSeq", "instanceId"]);
  const durableThroughSeq = requireSafeIntegerAtLeast(cursor, "durableThroughSeq", -1);
  return {
    sessionId: requireNonEmptyString(cursor, "sessionId"),
    durableThroughSeq,
    instanceId: requireNonEmptyString(cursor, "instanceId"),
  };
}
