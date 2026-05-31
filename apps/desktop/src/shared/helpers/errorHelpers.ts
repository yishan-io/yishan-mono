/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * When the value is an `Error` instance its `.message` property is returned.
 * For all other values `String(value)` is used as the fallback so the caller
 * always receives a plain string regardless of what was thrown.
 *
 * This module lives in `shared/` so both the main process and renderer process
 * can import from the same source.
 *
 * @example
 * ```ts
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   const message = getErrorMessage(error);
 *   showToast(message);
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
