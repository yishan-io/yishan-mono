import { describe, expect, it, vi } from "vitest";

describe("app.config", () => {
  it("registers the canonical app scheme and configured Google OAuth scheme", async () => {
    vi.stubEnv("EXPO_PUBLIC_GOOGLE_OAUTH_IOS_SCHEME", "com.googleusercontent.apps.ios-client");
    vi.resetModules();

    const config = (await import("./app.config")).default;

    expect(config.scheme).toEqual(["yishan", "com.googleusercontent.apps.ios-client"]);
  });
});
