import type { PiProviderConfigErrorCode, PiProviderConfigErrorPayload } from "../../shared/contracts/piProviderConfig";

const UNKNOWN_OPERATION_MESSAGE = "The provider operation failed. Please try again.";

/** Main-process error carrying a stable renderer-facing provider configuration error code. */
export class PiProviderConfigError extends Error {
  readonly code: PiProviderConfigErrorCode;

  constructor(code: PiProviderConfigErrorCode, message: string) {
    super(message);
    this.name = "PiProviderConfigError";
    this.code = code;
  }
}

/** Creates the shared typed cancellation error used across authentication coordinators. */
export function createPiProviderConfigCancellationError(): PiProviderConfigError {
  return new PiProviderConfigError("cancelled", "Login cancelled.");
}

/** Normalizes provider-specific abort failures to the stable provider configuration cancellation error. */
export function normalizePiProviderAuthenticationError(error: unknown, signal: AbortSignal): unknown {
  return signal.aborted ? createPiProviderConfigCancellationError() : error;
}

/** Converts a main-process failure to a stable serializable renderer payload. */
export function toPiProviderConfigErrorPayload(error: unknown): PiProviderConfigErrorPayload {
  if (error instanceof PiProviderConfigError) {
    return { code: error.code, message: error.message };
  }
  return { code: "operation_failed", message: UNKNOWN_OPERATION_MESSAGE };
}
