import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import { StatusCodes } from "http-status-codes";

import {
  OAUTH_COOKIE_NAME,
  type OAuthCookiePayload,
  SESSION_COOKIE_NAME,
  cookieOptions,
  oauthCookiePayloadSchema,
} from "@/auth/http";
import { InvalidOAuthCallbackError, OAuthStateMismatchError, ProviderEmailNotVerifiedError } from "@/errors";
import type { AppContext } from "@/hono";
import type { OAuthStartQueryInput, RefreshTokenBodyInput, RevokeTokenBodyInput } from "@/validation/auth";

/** Cookie max-age for the OAuth state cookie, in seconds (10 minutes). */
const OAUTH_STATE_COOKIE_MAX_AGE_SECONDS = 10 * 60;

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

export async function startOAuthHandler(c: AppContext, query: OAuthStartQueryInput) {
  const providerParam = c.get("oauthProvider");
  const config = c.get("config");
  const authService = c.get("services").auth;
  const oauthBaseUrl = config.appBaseUrl;
  const { authorizationUrl, state, codeVerifier } = await authService.buildOAuthAuthorizationUrl(
    providerParam,
    oauthBaseUrl,
  );

  const responseMode = query.mode;
  const cliRedirectUri = parseCliRedirectUri(query.redirect_uri);
  const cliState = query.state;

  if (responseMode === "cli" && (!cliRedirectUri || !cliState)) {
    return c.json(
      { error: "mode=cli requires valid redirect_uri and state query parameters" },
      StatusCodes.BAD_REQUEST,
    );
  }

  const payload: OAuthCookiePayload = {
    provider: providerParam,
    state,
    codeVerifier,
    createdAt: Date.now(),
    callbackBaseUrl: oauthBaseUrl,
    responseMode,
    cliRedirectUri: responseMode === "cli" ? (cliRedirectUri ?? undefined) : undefined,
    cliState: responseMode === "cli" ? (cliState ?? undefined) : undefined,
  };

  await setSignedCookie(c, OAUTH_COOKIE_NAME, JSON.stringify(payload), config.sessionSecret, {
    ...cookieOptions(c.req.url, config.cookieDomain),
    maxAge: OAUTH_STATE_COOKIE_MAX_AGE_SECONDS,
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
    throw new InvalidOAuthCallbackError("missing state, code or OAuth cookie");
  }

  let oauthContext: OAuthCookiePayload;

  try {
    oauthContext = oauthCookiePayloadSchema.parse(JSON.parse(rawCookie));
  } catch {
    throw new InvalidOAuthCallbackError("malformed OAuth cookie payload");
  }

  // No manual freshness check needed — the cookie is set with maxAge: 600 so an
  // expired cookie is never returned by getSignedCookie.
  if (oauthContext.state !== state || oauthContext.provider !== providerParam) {
    throw new OAuthStateMismatchError();
  }

  const profile = await authService.exchangeOAuthCodeForProfile(
    providerParam,
    code,
    oauthContext.codeVerifier,
    oauthContext.callbackBaseUrl ?? config.appBaseUrl,
  );

  if (!profile.emailVerified) {
    throw new ProviderEmailNotVerifiedError();
  }

  const userId = await authService.resolveUserIdForOAuthProfile(profile);

  const responseMode = oauthContext.responseMode ?? c.req.query("mode");

  if (responseMode === "token") {
    // Bearer-token clients do not use the session cookie — skip creating it.
    const tokens = await authService.issueApiTokens(userId);
    return c.json({ userId, tokens });
  }

  if (responseMode === "cli") {
    if (!oauthContext.cliRedirectUri || !oauthContext.cliState) {
      throw new InvalidOAuthCallbackError("missing CLI redirect_uri or state");
    }

    // CLI mode uses a bearer token redirected to the local callback server — no cookie needed.
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

  // Default (web) mode: create a session cookie.
  const session = await authService.createWebSession(userId, config.sessionTtlDays);
  setCookie(c, SESSION_COOKIE_NAME, session.token, {
    ...cookieOptions(c.req.url, config.cookieDomain),
    expires: session.expiresAt,
  });

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
    ...tokens,
  });
}

export async function refreshTokenHandler(c: AppContext, body: RefreshTokenBodyInput) {
  const authService = c.get("services").auth;
  const refreshed = await authService.refreshApiTokens(body.refreshToken);

  if (!refreshed) {
    return c.json({ error: "Invalid refresh token" }, StatusCodes.UNAUTHORIZED);
  }

  return c.json({
    tokenType: "Bearer",
    ...refreshed,
  });
}

export async function revokeTokenHandler(c: AppContext, body: RevokeTokenBodyInput) {
  const authService = c.get("services").auth;
  await authService.revokeApiRefreshToken(body.refreshToken);

  return c.json({ ok: true });
}
