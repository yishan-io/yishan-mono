import { Hono } from "hono";

import {
  callbackOAuthHandler,
  logoutHandler,
  startOAuthHandler
} from "../handlers/auth";
import type { AppEnv } from "../hono";
import { requireOAuthProvider } from "../middlewares/oauth";

export const authRouter = new Hono<AppEnv>();

authRouter.get("/:provider", requireOAuthProvider, startOAuthHandler);
authRouter.get("/:provider/callback", requireOAuthProvider, callbackOAuthHandler);
authRouter.post("/logout", logoutHandler);
