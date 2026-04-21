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

export async function startOAuthHandler(c: AppContext) {
  const providerParam = c.get("oauthProvider");
  const config = c.get("config");
  const { authorizationUrl, state, codeVerifier } = await buildAuthorizationUrl(
    providerParam,
    config
  );

  const payload: OAuthCookiePayload = {
    provider: providerParam,
    state,
    codeVerifier,
    createdAt: Date.now()
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

  const responseMode = c.req.query("mode");

  const session = await authService.createWebSession(userId, config.sessionTtlDays);
  setCookie(c, SESSION_COOKIE_NAME, session.token, {
    ...cookieOptions(c.req.url, config.cookieDomain),
    expires: session.expiresAt
  });

  if (responseMode === "token") {
    const tokens = await authService.issueApiTokens(userId);
    return c.json({ userId, tokens });
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
