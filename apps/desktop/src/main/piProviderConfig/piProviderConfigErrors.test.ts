import { describe, expect, it } from "vitest";
import {
  PiProviderConfigError,
  createPiProviderConfigCancellationError,
  normalizePiProviderAuthenticationError,
  toPiProviderConfigErrorPayload,
} from "./piProviderConfigErrors";

describe("Pi provider configuration errors", () => {
  it("serializes typed errors without changing their stable code", () => {
    expect(
      toPiProviderConfigErrorPayload(new PiProviderConfigError("invalid_credential", "API key is required.")),
    ).toEqual({
      code: "invalid_credential",
      message: "API key is required.",
    });
  });

  it("does not expose unknown main-process errors across IPC", () => {
    expect(toPiProviderConfigErrorPayload(new Error("secret filesystem path"))).toEqual({
      code: "operation_failed",
      message: "The provider operation failed. Please try again.",
    });
  });

  it("creates a stable typed cancellation error", () => {
    expect(toPiProviderConfigErrorPayload(createPiProviderConfigCancellationError())).toEqual({
      code: "cancelled",
      message: "Login cancelled.",
    });
  });

  it("normalizes provider-specific abort failures when the authentication signal was cancelled", () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Provider aborted", "AbortError"));

    expect(
      toPiProviderConfigErrorPayload(normalizePiProviderAuthenticationError(new Error("SDK abort"), controller.signal)),
    ).toEqual({
      code: "cancelled",
      message: "Login cancelled.",
    });
  });
});
