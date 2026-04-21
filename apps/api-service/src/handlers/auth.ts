import { and, eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { buildAuthorizationUrl, exchangeCodeForProfile } from "../auth/oauth";
import { createSession, invalidateSession } from "../auth/session";
import {
  OAUTH_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  cookieOptions,
  type OAuthCookiePayload
} from "../auth/http";
import { signPayload, verifyPayload } from "../auth/security";
import { getDb } from "../db/client";
import { oauthAccounts, users } from "../db/schema";
import { getServiceConfig } from "../env";
import type { AppContext } from "../hono";

export async function startOAuthHandler(c: AppContext) {
  const providerParam = c.get("oauthProvider");

  const config = getServiceConfig(c);
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

  const signedPayload = await signPayload(payload, config.sessionSecret);
  setCookie(c, OAUTH_COOKIE_NAME, signedPayload, {
    ...cookieOptions(c.req.url, config.cookieDomain),
    maxAge: 10 * 60
  });

  return c.redirect(authorizationUrl, 302);
}

export async function callbackOAuthHandler(c: AppContext) {
  const providerParam = c.get("oauthProvider");

  const config = getServiceConfig(c);
  const state = c.req.query("state");
  const code = c.req.query("code");
  const rawCookie = getCookie(c, OAUTH_COOKIE_NAME);

  deleteCookie(c, OAUTH_COOKIE_NAME, cookieOptions(c.req.url, config.cookieDomain));

  if (!state || !code || !rawCookie) {
    return c.json({ error: "Invalid OAuth callback payload" }, 400);
  }

  const parsed = await verifyPayload<OAuthCookiePayload>(rawCookie, config.sessionSecret);
  if (!parsed.ok) {
    return c.json({ error: "Invalid OAuth state" }, 400);
  }

  const oauthContext = parsed.data;
  const isFresh = Date.now() - oauthContext.createdAt <= 10 * 60 * 1000;

  if (
    !isFresh ||
    oauthContext.state !== state ||
    oauthContext.provider !== providerParam
  ) {
    return c.json({ error: "OAuth state mismatch" }, 400);
  }

  const profile = await exchangeCodeForProfile(
    providerParam,
    code,
    oauthContext.codeVerifier,
    config
  );

  const db = getDb(config.databaseUrl);

  let userId: string | null = null;
  const existingAccountRows = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, profile.provider),
        eq(oauthAccounts.providerUserId, profile.providerUserId)
      )
    )
    .limit(1);

  if (existingAccountRows.length > 0) {
    userId = existingAccountRows[0]?.userId ?? null;
  }

  if (!userId) {
    const existingUserRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);

    if (existingUserRows.length > 0) {
      userId = existingUserRows[0]?.id ?? null;
    }
  }

  if (!userId) {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl
    });
  } else {
    await db
      .update(users)
      .set({
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  await db
    .insert(oauthAccounts)
    .values({
      id: crypto.randomUUID(),
      userId,
      provider: profile.provider,
      providerUserId: profile.providerUserId
    })
    .onConflictDoNothing();

  const session = await createSession(db, userId, config.sessionTtlDays);
  setCookie(c, SESSION_COOKIE_NAME, session.token, {
    ...cookieOptions(c.req.url, config.cookieDomain),
    expires: session.expiresAt
  });

  return c.redirect(new URL("/", config.appBaseUrl).toString(), 302);
}

export async function logoutHandler(c: AppContext) {
  const config = getServiceConfig(c);
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);

  if (sessionToken) {
    const db = getDb(config.databaseUrl);
    await invalidateSession(db, sessionToken);
  }

  deleteCookie(c, SESSION_COOKIE_NAME, cookieOptions(c.req.url, config.cookieDomain));
  return c.json({ ok: true });
}
