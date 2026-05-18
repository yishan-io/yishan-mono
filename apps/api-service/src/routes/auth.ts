import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  callbackOAuthHandler,
  issueTokenHandler,
  logoutHandler,
  refreshTokenHandler,
  revokeTokenHandler,
  startOAuthHandler,
} from "@/handlers/auth";
import type { AppEnv } from "@/hono";
import { requireOAuthProvider } from "@/middlewares/oauth";
import { requireSessionUser } from "@/middlewares/session";
import { oauthStartQuerySchema, refreshTokenBodySchema, revokeTokenBodySchema } from "@/validation/auth";
import { validationErrorResponse } from "@/validation/error-response";

export const authRouter = new Hono<AppEnv>();

authRouter.get(
  "/:provider",
  requireOAuthProvider,
  zValidator("query", oauthStartQuerySchema, validationErrorResponse),
  (c) => startOAuthHandler(c, c.req.valid("query")),
);
authRouter.get("/:provider/callback", requireOAuthProvider, callbackOAuthHandler);
authRouter.post("/token", requireSessionUser, issueTokenHandler);
authRouter.post("/refresh", zValidator("json", refreshTokenBodySchema, validationErrorResponse), (c) =>
  refreshTokenHandler(c, c.req.valid("json")),
);
authRouter.post("/revoke", zValidator("json", revokeTokenBodySchema, validationErrorResponse), (c) =>
  revokeTokenHandler(c, c.req.valid("json")),
);
authRouter.post("/logout", logoutHandler);
