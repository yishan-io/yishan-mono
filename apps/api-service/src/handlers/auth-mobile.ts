import { StatusCodes } from "http-status-codes";

import { exchangeCodeForProfileWithRedirectUri } from "@/auth/oauth";
import type { AppContext } from "@/hono";
import type { MobileOAuthExchangeBodyInput } from "@/validation/auth";

const MOBILE_OAUTH_CALLBACK_PATH = "oauth/google/callback";

function normalizePath(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function toGoogleIosScheme(clientId: string): string {
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, "")}`;
}

function isSupportedMobileRedirectUri(redirectUri: string, clientId: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return false;
  }

  return parsed.protocol === `${toGoogleIosScheme(clientId)}:` && normalizePath(parsed.pathname) === MOBILE_OAUTH_CALLBACK_PATH;
}

export async function exchangeMobileOAuthHandler(c: AppContext, body: MobileOAuthExchangeBodyInput) {
  const config = c.get("config");
  const authService = c.get("services").auth;
  const supportedClientIds = [config.googleClientIdIos, config.googleClientIdAndroid].filter(
    (clientId): clientId is string => Boolean(clientId),
  );

  if (!supportedClientIds.includes(body.clientId)) {
    return c.json({ error: "Unsupported mobile Google client" }, StatusCodes.BAD_REQUEST);
  }

  if (!isSupportedMobileRedirectUri(body.redirectUri, body.clientId)) {
    return c.json({ error: "Unsupported mobile OAuth redirect URI" }, StatusCodes.BAD_REQUEST);
  }

  const profile = await exchangeCodeForProfileWithRedirectUri(
    body.provider,
    body.code,
    body.codeVerifier,
    config,
    body.redirectUri,
    {
      clientId: body.clientId,
      clientSecret: undefined,
    },
  );

  if (!profile.emailVerified) {
    return c.json({ error: "Provider email must be verified" }, StatusCodes.BAD_REQUEST);
  }

  const userId = await authService.resolveUserIdForOAuthProfile(profile);
  const tokens = await authService.issueApiTokens(userId);

  return c.json({
    tokenType: "Bearer",
    ...tokens,
  });
}
