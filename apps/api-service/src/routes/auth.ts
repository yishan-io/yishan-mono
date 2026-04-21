import { Hono } from "hono";

import {
  callbackOAuthHandler,
  issueTokenHandler,
  logoutHandler,
  refreshTokenHandler,
  revokeTokenHandler,
  startOAuthHandler
} from "../handlers/auth";
import type { AppEnv } from "../hono";
import { requireOAuthProvider } from "../middlewares/oauth";
import { requireSessionUser } from "../middlewares/session";

export const authRouter = new Hono<AppEnv>();

authRouter.get("/:provider", requireOAuthProvider, startOAuthHandler);
authRouter.get("/:provider/callback", requireOAuthProvider, callbackOAuthHandler);
authRouter.post("/token", requireSessionUser, issueTokenHandler);
authRouter.post("/refresh", refreshTokenHandler);
authRouter.post("/revoke", revokeTokenHandler);
authRouter.post("/logout", logoutHandler);
