import type { PiRuntimeErrorCode, PiRuntimeErrorPayload } from "../../shared/contracts/piRuntime";

const UNKNOWN_OPERATION_MESSAGE = "The provider operation failed. Please try again.";

/** Main-process error carrying a stable renderer-facing Pi runtime error code. */
export class PiRuntimeError extends Error {
  readonly code: PiRuntimeErrorCode;

  constructor(code: PiRuntimeErrorCode, message: string) {
    super(message);
    this.name = "PiRuntimeError";
    this.code = code;
  }
}

/** Creates the shared typed cancellation error used across authentication coordinators. */
export function createPiRuntimeCancellationError(): PiRuntimeError {
  return new PiRuntimeError("cancelled", "Login cancelled.");
}

/** Normalizes provider-specific abort failures to the stable Pi runtime cancellation error. */
export function normalizePiRuntimeAuthenticationError(error: unknown, signal: AbortSignal): unknown {
  return signal.aborted ? createPiRuntimeCancellationError() : error;
}

/** Converts a main-process failure to a stable serializable renderer payload. */
export function toPiRuntimeErrorPayload(error: unknown): PiRuntimeErrorPayload {
  if (error instanceof PiRuntimeError) {
    return { code: error.code, message: error.message };
  }
  return { code: "operation_failed", message: UNKNOWN_OPERATION_MESSAGE };
}
