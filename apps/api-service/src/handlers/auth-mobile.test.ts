import { beforeEach, describe, expect, it, vi } from "vitest";

import { exchangeCodeForProfileWithRedirectUri } from "@/auth/oauth";
import type { AppContext } from "@/hono";
import type { ServiceConfig } from "@/types";
import { exchangeMobileOAuthHandler } from "./auth-mobile";

vi.mock("@/auth/oauth", () => ({
  exchangeCodeForProfileWithRedirectUri: vi.fn(),
}));

const config = {
  googleClientIdIos: "ios-client.apps.googleusercontent.com",
  googleClientIdAndroid: "android-client.apps.googleusercontent.com",
} as ServiceConfig;

const tokens = {
  accessToken: "access-token",
  accessTokenExpiresAt: "2026-06-16T00:15:00.000Z",
  accessTokenExpiresIn: 900,
  refreshToken: "refresh-token",
  refreshTokenExpiresAt: "2026-07-16T00:00:00.000Z",
};

function createContext() {
  const auth = {
    resolveUserIdForOAuthProfile: vi.fn(async () => "user-1"),
    issueApiTokens: vi.fn(async () => tokens),
  };
  const json = vi.fn((body: unknown, status?: number) => ({ body, status }));

  return {
    auth,
    c: {
      get: vi.fn((key: string) => {
        if (key === "config") {
          return config;
        }

        if (key === "services") {
          return { auth };
        }

        return undefined;
      }),
      json,
    } as unknown as AppContext,
    json,
  };
}

describe("exchangeMobileOAuthHandler", () => {
  beforeEach(() => {
    vi.mocked(exchangeCodeForProfileWithRedirectUri).mockReset();
  });

  it("rejects unsupported mobile Google clients", async () => {
    const { c, json } = createContext();

    await exchangeMobileOAuthHandler(c, {
      provider: "google",
      code: "code",
      codeVerifier: "verifier",
      redirectUri: "com.googleusercontent.apps.ios-client:/oauth/google/callback",
      clientId: "web-client",
    });

    expect(json).toHaveBeenCalledWith({ error: "Unsupported mobile Google client" }, 400);
    expect(exchangeCodeForProfileWithRedirectUri).not.toHaveBeenCalled();
  });

  it("rejects redirect URIs that do not match the supported mobile callback", async () => {
    const { c, json } = createContext();

    await exchangeMobileOAuthHandler(c, {
      provider: "google",
      code: "code",
      codeVerifier: "verifier",
      redirectUri: "https://example.com/oauth/google/callback",
      clientId: "ios-client.apps.googleusercontent.com",
    });

    expect(json).toHaveBeenCalledWith({ error: "Unsupported mobile OAuth redirect URI" }, 400);
    expect(exchangeCodeForProfileWithRedirectUri).not.toHaveBeenCalled();
  });

  it("exchanges supported mobile codes for bearer tokens", async () => {
    const { c, json } = createContext();
    vi.mocked(exchangeCodeForProfileWithRedirectUri).mockResolvedValue({
      provider: "google",
      providerUserId: "google-user",
      email: "user@example.com",
      emailVerified: true,
      name: "User",
      avatarUrl: null,
    });

    await exchangeMobileOAuthHandler(c, {
      provider: "google",
      code: "code",
      codeVerifier: "verifier",
      redirectUri: "com.googleusercontent.apps.ios-client:/oauth/google/callback",
      clientId: "ios-client.apps.googleusercontent.com",
    });

    expect(exchangeCodeForProfileWithRedirectUri).toHaveBeenCalledWith(
      "google",
      "code",
      "verifier",
      config,
      "com.googleusercontent.apps.ios-client:/oauth/google/callback",
      {
        clientId: "ios-client.apps.googleusercontent.com",
        clientSecret: undefined,
      },
    );
    expect(json).toHaveBeenCalledWith({
      tokenType: "Bearer",
      ...tokens,
    });
  });
});
