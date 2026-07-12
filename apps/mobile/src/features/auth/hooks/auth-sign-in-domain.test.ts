import { describe, expect, it } from "vitest";

import type { OAuthCallbackParams } from "@/features/auth/oauth/auth-link";
import type { PendingGoogleOAuthSession } from "@/features/auth/oauth/oauth-storage";

import { getSignInErrorMessage, resolveGoogleOAuthCallback } from "./auth-sign-in-domain";

const callback: OAuthCallbackParams = {
  code: "code",
  state: "state",
};

const pendingSession: PendingGoogleOAuthSession = {
  clientId: "client",
  codeVerifier: "verifier",
  createdAt: 1_000,
  provider: "google",
  redirectUri: "yishan:/oauth/google/callback",
  state: "state",
};

describe("auth-sign-in-domain", () => {
  it("prefers explicit error descriptions from callback responses", () => {
    expect(
      resolveGoogleOAuthCallback({
        callback: {
          error: "access_denied",
          errorDescription: "denied by user",
        },
        pendingSession,
        now: 1_000,
        messages: {
          expired: "expired",
          mismatch: "mismatch",
          missingFields: "missing",
          missingPendingRequest: "missing pending",
        },
      }),
    ).toEqual({
      kind: "error",
      clearPendingSession: true,
      message: "denied by user",
    });
  });

  it("builds exchange input only for valid pending sessions", () => {
    expect(
      resolveGoogleOAuthCallback({
        callback,
        pendingSession,
        now: 1_100,
        messages: {
          expired: "expired",
          mismatch: "mismatch",
          missingFields: "missing",
          missingPendingRequest: "missing pending",
        },
      }),
    ).toEqual({
      kind: "exchange",
      clearPendingSession: true,
      input: {
        provider: "google",
        code: "code",
        codeVerifier: "verifier",
        redirectUri: "yishan:/oauth/google/callback",
        clientId: "client",
      },
    });
  });

  it("reports missing pending state without clearing storage", () => {
    expect(
      resolveGoogleOAuthCallback({
        callback,
        pendingSession: null,
        now: 1_100,
        messages: {
          expired: "expired",
          mismatch: "mismatch",
          missingFields: "missing",
          missingPendingRequest: "missing pending",
        },
      }),
    ).toEqual({
      kind: "error",
      clearPendingSession: false,
      message: "missing pending",
    });
  });

  it("maps generic thrown values to fallback messages", () => {
    expect(getSignInErrorMessage("boom", "fallback")).toBe("fallback");
    expect(getSignInErrorMessage(new Error("boom"), "fallback")).toBe("boom");
  });
});
