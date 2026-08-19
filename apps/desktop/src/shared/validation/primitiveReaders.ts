/**
 * Primitive payload readers (desktop8 Phase 31: moved out of root RPC).
 *
 * Domain adapters own their payload validation; these business-neutral
 * readers are shared across Domain Infrastructure clients.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

export function readOptionalString(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  const value = input.trim();
  return value || undefined;
}

export function readOptionalBoolean(input: unknown): boolean | undefined {
  return typeof input === "boolean" ? input : undefined;
}

export function readOptionalNumber(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input) ? input : undefined;
}

export function readOptionalStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const values: string[] = [];
  for (const candidate of input) {
    if (typeof candidate === "string") {
      values.push(candidate);
    }
  }

  return values;
}
