import type { Next } from "hono";
import { StatusCodes } from "http-status-codes";

import { isOAuthProvider } from "@/auth/http";
import type { AppContext } from "@/hono";

export async function requireOAuthProvider(c: AppContext, next: Next) {
  const provider = c.req.param("provider");
  if (!provider || !isOAuthProvider(provider)) {
    return c.json({ error: "Unsupported provider" }, StatusCodes.BAD_REQUEST);
  }

  c.set("oauthProvider", provider);
  await next();
}
