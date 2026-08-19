/**
 * Generates a random UUID string. Uses the native `crypto.randomUUID()` API
 * when available and falls back to a time-based string for environments that
 * do not yet expose the Web Crypto API (e.g. older Node/jsdom test runtimes).
 *
 * This module lives in `shared/` so both the main process and renderer process
 * can import from the same source.
 *
 * @example
 * ```ts
 * const id = generateId(); // "110e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
