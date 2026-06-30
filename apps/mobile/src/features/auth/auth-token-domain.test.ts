import { describe, expect, it } from "vitest";

import { toStoredSession } from "./auth-token-domain";

describe("auth-token-domain", () => {
  it("converts auth token records into stored sessions", () => {
    expect(
      toStoredSession({
        accessToken: "access-token",
        accessTokenExpiresAt: "2026-06-16T00:00:00.000Z",
        refreshToken: "refresh-token",
        refreshTokenExpiresAt: "2026-06-17T00:00:00.000Z",
        tokenType: "Bearer",
      }),
    ).toEqual({
      accessToken: "access-token",
      accessTokenExpiresAt: "2026-06-16T00:00:00.000Z",
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: "2026-06-17T00:00:00.000Z",
      tokenType: "Bearer",
    });
  });
});
