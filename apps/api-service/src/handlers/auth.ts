import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import { StatusCodes } from "http-status-codes";

import { buildAuthorizationUrl, exchangeCodeForProfile } from "@/auth/oauth";
import {
  OAUTH_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  cookieOptions,
  type OAuthCookiePayload
} from "@/auth/http";
import type { AppContext } from "@/hono";

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function parseCliRedirectUri(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:") {
    return null;
  }

  if (!isLoopbackHost(parsed.hostname)) {
    return null;
  }

  if (!parsed.port) {
    return null;
  }

  return parsed.toString();
}

export async function startOAuthHandler(c: AppContext) {
  const providerParam = c.get("oauthProvider");
  const config = c.get("config");
  const { authorizationUrl, state, codeVerifier } = await buildAuthorizationUrl(
    providerParam,
    config
  );

  const responseModeParam = c.req.query("mode");
  const responseMode = responseModeParam === "token" || responseModeParam === "cli" ? responseModeParam : undefined;
  const cliRedirectUri = parseCliRedirectUri(c.req.query("redirect_uri"));
  const cliState = c.req.query("state");

  if (responseMode === "cli" && (!cliRedirectUri || !cliState)) {
    return c.json(
      { error: "mode=cli requires valid redirect_uri and state query parameters" },
      StatusCodes.BAD_REQUEST
    );
  }

  const payload: OAuthCookiePayload = {
    provider: providerParam,
    state,
    codeVerifier,
    createdAt: Date.now(),
    responseMode,
    cliRedirectUri: responseMode === "cli" ? cliRedirectUri ?? undefined : undefined,
    cliState: responseMode === "cli" ? cliState ?? undefined : undefined
  };

  await setSignedCookie(c, OAUTH_COOKIE_NAME, JSON.stringify(payload), config.sessionSecret, {
    ...cookieOptions(c.req.url, config.cookieDomain),
    maxAge: 10 * 60
  });

  return c.redirect(authorizationUrl, StatusCodes.MOVED_TEMPORARILY);
}

export async function callbackOAuthHandler(c: AppContext) {
  const providerParam = c.get("oauthProvider");
  const config = c.get("config");
  const authService = c.get("services").auth;
  const state = c.req.query("state");
  const code = c.req.query("code");
  const rawCookie = await getSignedCookie(c, config.sessionSecret, OAUTH_COOKIE_NAME);

  deleteCookie(c, OAUTH_COOKIE_NAME, cookieOptions(c.req.url, config.cookieDomain));

  if (!state || !code || !rawCookie) {
    return c.json({ error: "Invalid OAuth callback payload" }, StatusCodes.BAD_REQUEST);
  }

  let oauthContext: OAuthCookiePayload;

  try {
    oauthContext = JSON.parse(rawCookie) as OAuthCookiePayload;
  } catch {
    return c.json({ error: "Invalid OAuth state" }, StatusCodes.BAD_REQUEST);
  }

  const isFresh = Date.now() - oauthContext.createdAt <= 10 * 60 * 1000;

  if (
    !isFresh ||
    oauthContext.state !== state ||
    oauthContext.provider !== providerParam
  ) {
    return c.json({ error: "OAuth state mismatch" }, StatusCodes.BAD_REQUEST);
  }

  const profile = await exchangeCodeForProfile(
    providerParam,
    code,
    oauthContext.codeVerifier,
    config
  );

  if (!profile.emailVerified) {
    return c.json({ error: "Provider email must be verified" }, StatusCodes.BAD_REQUEST);
  }

  const userId = await authService.resolveUserIdForOAuthProfile(profile);

  const responseMode = oauthContext.responseMode ?? c.req.query("mode");

  const session = await authService.createWebSession(userId, config.sessionTtlDays);
  setCookie(c, SESSION_COOKIE_NAME, session.token, {
    ...cookieOptions(c.req.url, config.cookieDomain),
    expires: session.expiresAt
  });

  if (responseMode === "token") {
    const tokens = await authService.issueApiTokens(userId);
    return c.json({ userId, tokens });
  }

  if (responseMode === "cli") {
    if (!oauthContext.cliRedirectUri || !oauthContext.cliState) {
      return c.json({ error: "Invalid OAuth CLI context" }, StatusCodes.BAD_REQUEST);
    }

    const tokens = await authService.issueApiTokens(userId);
    const redirectUrl = new URL(oauthContext.cliRedirectUri);
    redirectUrl.searchParams.set("state", oauthContext.cliState);
    redirectUrl.searchParams.set("tokenType", "Bearer");
    redirectUrl.searchParams.set("accessToken", tokens.accessToken);
    redirectUrl.searchParams.set("accessTokenExpiresIn", String(tokens.accessTokenExpiresIn));
    redirectUrl.searchParams.set("accessTokenExpiresAt", tokens.accessTokenExpiresAt);
    redirectUrl.searchParams.set("refreshToken", tokens.refreshToken);
    redirectUrl.searchParams.set("refreshTokenExpiresAt", tokens.refreshTokenExpiresAt);

    return c.redirect(redirectUrl.toString(), StatusCodes.MOVED_TEMPORARILY);
  }

  return c.redirect(new URL("/", config.appBaseUrl).toString(), StatusCodes.MOVED_TEMPORARILY);
}

export async function logoutHandler(c: AppContext) {
  const config = c.get("config");
  const authService = c.get("services").auth;
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);

  if (sessionToken) {
    await authService.invalidateWebSession(sessionToken);
  }

  deleteCookie(c, SESSION_COOKIE_NAME, cookieOptions(c.req.url, config.cookieDomain));
  return c.json({ ok: true });
}

export async function issueTokenHandler(c: AppContext) {
  const authService = c.get("services").auth;
  const sessionUser = c.get("sessionUser");

  const tokens = await authService.issueApiTokens(sessionUser.id);
  return c.json({
    tokenType: "Bearer",
    ...tokens
  });
}

export async function refreshTokenHandler(c: AppContext) {
  let body: { refreshToken?: string };

  try {
    body = await c.req.json<{ refreshToken?: string }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, StatusCodes.BAD_REQUEST);
  }

  if (!body.refreshToken) {
    return c.json({ error: "refreshToken is required" }, StatusCodes.BAD_REQUEST);
  }

  const authService = c.get("services").auth;
  const refreshed = await authService.refreshApiTokens(body.refreshToken);

  if (!refreshed) {
    return c.json({ error: "Invalid refresh token" }, StatusCodes.UNAUTHORIZED);
  }

  return c.json({
    tokenType: "Bearer",
    ...refreshed
  });
}

export async function revokeTokenHandler(c: AppContext) {
  let body: { refreshToken?: string };

  try {
    body = await c.req.json<{ refreshToken?: string }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, StatusCodes.BAD_REQUEST);
  }

  if (!body.refreshToken) {
    return c.json({ error: "refreshToken is required" }, StatusCodes.BAD_REQUEST);
  }

  const authService = c.get("services").auth;
  await authService.revokeApiRefreshToken(body.refreshToken);

  return c.json({ ok: true });
}
