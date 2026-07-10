import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({
  default: {},
  getRandomBytes: (length: number) => new Uint8Array(length),
}));

vi.mock("expo-linking", () => ({
  default: {},
  createURL: (path: string, options?: { scheme?: string }) => `${options?.scheme ?? "yishan"}:/${path}`,
  parse: (url: string) => {
    const parsed = new URL(url.replace("yishan:/", "yishan://"));
    return {
      hostname: parsed.hostname,
      path: parsed.pathname.replace(/^\/+/, ""),
      queryParams: Object.fromEntries(parsed.searchParams.entries()),
      scheme: parsed.protocol.replace(/:$/, ""),
    };
  },
}));

vi.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));

let GOOGLE_OAUTH_CALLBACK_PATH: string;
let getGoogleOAuthClientId: typeof import("./google-oauth").getGoogleOAuthClientId;
let isGoogleOAuthCallbackPath: typeof import("./google-oauth").isGoogleOAuthCallbackPath;
let isGoogleOAuthRedirectUrl: typeof import("./google-oauth").isGoogleOAuthRedirectUrl;
const originalGoogleClientIdIos = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS;
const originalGoogleOauthClientIdIos = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS;

beforeAll(async () => {
  const module = await import("./google-oauth");
  GOOGLE_OAUTH_CALLBACK_PATH = module.GOOGLE_OAUTH_CALLBACK_PATH;
  getGoogleOAuthClientId = module.getGoogleOAuthClientId;
  isGoogleOAuthCallbackPath = module.isGoogleOAuthCallbackPath;
  isGoogleOAuthRedirectUrl = module.isGoogleOAuthRedirectUrl;
});

beforeEach(() => {
  Reflect.deleteProperty(process.env, "EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS");
  Reflect.deleteProperty(process.env, "EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS");
});

afterEach(() => {
  if (originalGoogleClientIdIos === undefined) {
    Reflect.deleteProperty(process.env, "EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS");
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS = originalGoogleClientIdIos;
  }

  if (originalGoogleOauthClientIdIos === undefined) {
    Reflect.deleteProperty(process.env, "EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS");
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS = originalGoogleOauthClientIdIos;
  }
});

describe("google-oauth", () => {
  it("accepts the canonical callback path only", () => {
    expect(isGoogleOAuthCallbackPath(GOOGLE_OAUTH_CALLBACK_PATH, "")).toBe(true);
    expect(isGoogleOAuthCallbackPath("auth/callback", "")).toBe(false);
    expect(isGoogleOAuthCallbackPath("callback", "auth")).toBe(false);
  });

  it("accepts the canonical redirect url and rejects the legacy callback url", () => {
    expect(isGoogleOAuthRedirectUrl("yishan:/oauth/google/callback?code=code&state=state")).toBe(true);
    expect(isGoogleOAuthRedirectUrl("yishan://auth/callback?code=code&state=state")).toBe(false);
  });

  it("prefers the new iOS client id env key", () => {
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS = "new-ios-client";

    expect(getGoogleOAuthClientId()).toBe("new-ios-client");
  });

  it("throws when the iOS client id env key is missing", () => {
    Reflect.deleteProperty(process.env, "EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS");
    Reflect.deleteProperty(process.env, "EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS");

    expect(() => getGoogleOAuthClientId()).toThrow(
      "Missing required environment variable: EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS",
    );
  });
});
