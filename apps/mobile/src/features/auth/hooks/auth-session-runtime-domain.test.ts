import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

import {
  normalizeStoredSession,
  shouldClearStoredSessionAfterRefreshFailure,
  shouldRefreshStoredSession,
} from "./auth-session-runtime-domain";

describe("auth-session-runtime-domain", () => {
  it("normalizes token type to bearer", () => {
    expect(
      normalizeStoredSession({
        accessToken: "a",
        accessTokenExpiresAt: "2026-06-16T00:00:00.000Z",
        refreshToken: "r",
        refreshTokenExpiresAt: "2026-06-17T00:00:00.000Z",
        tokenType: "Bearer",
      }).tokenType,
    ).toBe("Bearer");
  });

  it("requests refresh for invalid dates or soon-expiring sessions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T00:00:00.000Z"));

    expect(shouldRefreshStoredSession("not-a-date")).toBe(true);
    expect(shouldRefreshStoredSession("2026-06-16T00:00:30.000Z")).toBe(true);
    expect(shouldRefreshStoredSession("2026-06-16T00:05:00.000Z")).toBe(false);
  });

  it("clears only auth failures that invalidate the refresh token", () => {
    expect(shouldClearStoredSessionAfterRefreshFailure(new ApiError("auth required", 401, "AUTH_REQUIRED"))).toBe(true);
    expect(shouldClearStoredSessionAfterRefreshFailure(new ApiError("server error", 500, "SERVER_ERROR"))).toBe(false);
    expect(shouldClearStoredSessionAfterRefreshFailure(new Error("boom"))).toBe(false);
  });
});
