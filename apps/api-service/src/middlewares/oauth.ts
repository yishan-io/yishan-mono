import type { Next } from "hono";

import { isOAuthProvider } from "../auth/http";
import type { AppContext } from "../hono";

export async function requireOAuthProvider(c: AppContext, next: Next) {
  const provider = c.req.param("provider");
  if (!provider || !isOAuthProvider(provider)) {
    return c.json({ error: "Unsupported provider" }, 400);
  }

  c.set("oauthProvider", provider);
  await next();
}
