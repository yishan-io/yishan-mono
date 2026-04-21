import { getCookie } from "hono/cookie";
import type { Next } from "hono";

import { SESSION_COOKIE_NAME } from "../auth/http";
import { getSessionUser } from "../auth/session";
import { getDb } from "../db/client";
import { getServiceConfig } from "../env";
import type { AppContext } from "../hono";

export async function requireSessionUser(c: AppContext, next: Next) {
  const config = getServiceConfig(c);
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);

  if (!sessionToken) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb(config.databaseUrl);
  const sessionUser = await getSessionUser(db, sessionToken);

  if (!sessionUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("sessionUser", sessionUser);
  await next();
}
