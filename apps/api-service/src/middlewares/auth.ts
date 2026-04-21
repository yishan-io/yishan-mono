import { getCookie } from "hono/cookie";
import type { Next } from "hono";

import { SESSION_COOKIE_NAME } from "../auth/http";
import type { AppContext } from "../hono";

function readBearerToken(c: AppContext): string | null {
  const authorization = c.req.header("Authorization");
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireAuthUser(c: AppContext, next: Next) {
  const authService = c.get("services").auth;

  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionToken) {
    const sessionUser = await authService.getSessionUserByToken(sessionToken);
    if (sessionUser) {
      c.set("sessionUser", sessionUser);
      await next();
      return;
    }
  }

  const bearerToken = readBearerToken(c);
  if (bearerToken) {
    const user = await authService.getUserFromAccessToken(bearerToken);
    if (user) {
      c.set("sessionUser", user);
      await next();
      return;
    }
  }

  return c.json({ error: "Unauthorized" }, 401);
}
