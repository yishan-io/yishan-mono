import type { OAuthProvider } from "@/types";

export const OAUTH_COOKIE_NAME = "oauth_ctx";
export const SESSION_COOKIE_NAME = "session";

export type OAuthCookiePayload = {
  provider: OAuthProvider;
  state: string;
  codeVerifier: string;
  createdAt: number;
  responseMode?: "token" | "cli";
  cliRedirectUri?: string;
  cliState?: string;
};

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "github";
}

export function cookieOptions(url: string, cookieDomain?: string) {
  const isSecure = new URL(url).protocol === "https:";
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: isSecure,
    path: "/",
    domain: cookieDomain
  };
}
