import { describe, expect, it } from "vitest";
import {
  PiRuntimeError,
  createPiRuntimeCancellationError,
  normalizePiRuntimeAuthenticationError,
  toPiRuntimeErrorPayload,
} from "./piRuntimeErrors";

describe("Pi runtime errors", () => {
  it("serializes typed errors without changing their stable code", () => {
    expect(toPiRuntimeErrorPayload(new PiRuntimeError("invalid_credential", "API key is required."))).toEqual({
      code: "invalid_credential",
      message: "API key is required.",
    });
  });

  it("does not expose unknown main-process errors across IPC", () => {
    expect(toPiRuntimeErrorPayload(new Error("secret filesystem path"))).toEqual({
      code: "operation_failed",
      message: "The provider operation failed. Please try again.",
    });
  });

  it("creates a stable typed cancellation error", () => {
    expect(toPiRuntimeErrorPayload(createPiRuntimeCancellationError())).toEqual({
      code: "cancelled",
      message: "Login cancelled.",
    });
  });

  it("normalizes provider-specific abort failures when the authentication signal was cancelled", () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Provider aborted", "AbortError"));

    expect(
      toPiRuntimeErrorPayload(normalizePiRuntimeAuthenticationError(new Error("SDK abort"), controller.signal)),
    ).toEqual({
      code: "cancelled",
      message: "Login cancelled.",
    });
  });
});
