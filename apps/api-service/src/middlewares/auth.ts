import type { Next } from "hono";
import { getCookie } from "hono/cookie";

import { SESSION_COOKIE_NAME } from "@/auth/http";
import { UnauthorizedError } from "@/errors";
import type { AppContext } from "@/hono";

const SERVICE_TOKEN_PREFIX = "yst_";

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
  const services = c.get("services");

  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionToken) {
    const sessionUser = await services.auth.getSessionUserByToken(sessionToken);
    if (sessionUser) {
      c.set("sessionUser", sessionUser);
      await next();
      return;
    }
  }

  const bearerToken = readBearerToken(c);
  if (bearerToken) {
    // Check service tokens first (opaque, prefixed with yst_)
    if (bearerToken.startsWith(SERVICE_TOKEN_PREFIX)) {
      const user = await services.serviceToken.verify(bearerToken);
      if (user) {
        c.set("sessionUser", user);
        await next();
        return;
      }
    } else {
      // JWT access token
      const user = await services.auth.getUserFromAccessToken(bearerToken);
      if (user) {
        c.set("sessionUser", user);
        await next();
        return;
      }
    }
  }

  throw new UnauthorizedError();
}
