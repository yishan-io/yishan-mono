import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  createServiceTokenHandler,
  listServiceTokensHandler,
  revokeServiceTokenHandler,
} from "@/handlers/service-token";
import type { AppEnv } from "@/hono";
import { validationErrorResponse } from "@/validation/error-response";
import { createServiceTokenBodySchema, serviceTokenParamsSchema } from "@/validation/service-token";

export const serviceTokenRouter = new Hono<AppEnv>();

serviceTokenRouter.post(
  "/service-tokens",
  zValidator("json", createServiceTokenBodySchema, validationErrorResponse),
  (c) => createServiceTokenHandler(c, c.req.valid("json")),
);

serviceTokenRouter.get("/service-tokens", (c) => listServiceTokensHandler(c));

serviceTokenRouter.delete(
  "/service-tokens/:tokenId",
  zValidator("param", serviceTokenParamsSchema, validationErrorResponse),
  (c) => revokeServiceTokenHandler(c, c.req.valid("param")),
);
