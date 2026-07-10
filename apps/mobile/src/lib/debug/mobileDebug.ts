/**
 * Emits development-only mobile diagnostics to the React Native console.
 * Feature code should call this helper instead of branching on `__DEV__` directly.
 */
export function logMobileDebug(scope: string, message: string, payload?: unknown) {
  if (!isDevelopmentRuntime()) {
    return;
  }

  if (payload === undefined) {
    console.log(`[mobile:${scope}] ${message}`);
    return;
  }

  console.log(`[mobile:${scope}] ${message} ${serializeDebugValue(payload)}`);
}

function isDevelopmentRuntime() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

/**
 * Serializes debug payloads into compact deterministic strings so exported device logs
 * preserve the actual values instead of collapsing them into generic "Object" entries.
 */
export function serializeDebugValue(value: unknown): string {
  try {
    return JSON.stringify(normalizeDebugValue(value, new WeakSet<object>()));
  } catch (error) {
    return JSON.stringify({
      serializationError: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Converts an unknown error into a small serializable debug summary.
 * Keep this infrastructure-owned so features do not grow ad hoc debug serializers.
 */
export function summarizeDebugError(error: unknown) {
  if (error instanceof Error) {
    const record = error as Error & {
      code?: unknown;
      details?: unknown;
      status?: unknown;
    };

    return {
      code: typeof record.code === "string" ? record.code : undefined,
      details: record.details,
      message: record.message,
      name: record.name,
      status: typeof record.status === "number" ? record.status : undefined,
    };
  }

  return {
    value: String(error),
  };
}

function normalizeDebugValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[function:${value.name || "anonymous"}]`;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => normalizeDebugValue(item, seen));
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(entries.map(([key, entryValue]) => [key, normalizeDebugValue(entryValue, seen)]));
}
