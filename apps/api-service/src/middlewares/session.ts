import { getCookie } from "hono/cookie";
import type { Next } from "hono";
import { StatusCodes } from "http-status-codes";

import { SESSION_COOKIE_NAME } from "@/auth/http";
import type { AppContext } from "@/hono";

export async function requireSessionUser(c: AppContext, next: Next) {
  const authService = c.get("services").auth;
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);

  if (!sessionToken) {
    return c.json({ error: "Unauthorized" }, StatusCodes.UNAUTHORIZED);
  }

  const sessionUser = await authService.getSessionUserByToken(sessionToken);

  if (!sessionUser) {
    return c.json({ error: "Unauthorized" }, StatusCodes.UNAUTHORIZED);
  }

  c.set("sessionUser", sessionUser);
  await next();
}
