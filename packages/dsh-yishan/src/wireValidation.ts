/** A JSON object awaiting field-level wire validation. */
export type WireRecord = Record<string, unknown>;

/** Requires an object with exactly the declared wire fields. */
export function requireExactRecord(payload: unknown, name: string, keys: readonly string[]): WireRecord {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError(`${name} must be an object`);
  }
  const record = payload as WireRecord;
  const actualKeys = Object.keys(record);
  if (actualKeys.length !== keys.length || actualKeys.some((key) => !keys.includes(key))) {
    throw new TypeError(`${name} has unsupported fields`);
  }
  return record;
}

/** Reads one required non-empty string field. */
export function requireNonEmptyString(record: WireRecord, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${field} is required`);
  return value;
}

/** Reads one required positive safe-integer field. */
export function requirePositiveSafeInteger(record: WireRecord, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
  return value;
}
