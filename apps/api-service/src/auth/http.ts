import type { OAuthProvider } from "@/types";
import { z } from "zod";

export const OAUTH_COOKIE_NAME = "oauth_ctx";
export const SESSION_COOKIE_NAME = "session";

/**
 * Zod schema for the OAuth state cookie payload. Parse all cookies through
 * this before accessing any fields to avoid silent cast failures.
 */
export const oauthCookiePayloadSchema = z.object({
  provider: z.enum(["google", "github"]),
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  createdAt: z.number().int(),
  callbackBaseUrl: z.string().optional(),
  responseMode: z.enum(["token", "cli"]).optional(),
  cliRedirectUri: z.string().optional(),
  cliState: z.string().optional(),
});

export type OAuthCookiePayload = z.infer<typeof oauthCookiePayloadSchema>;

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
    domain: cookieDomain,
  };
}
