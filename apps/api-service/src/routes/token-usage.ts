import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { listTokenUsageHourlyHandler, upsertTokenUsageHourlyHandler } from "@/handlers/token-usage";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import {
  tokenUsageHourlyQuerySchema,
  tokenUsageOrgParamsSchema,
  upsertTokenUsageHourlyBodySchema,
} from "@/validation/token-usage";

export const tokenUsageRouter = new Hono<AppEnv>();

tokenUsageRouter.use("/*", requireOrganizationMemberFromParam);

tokenUsageRouter.get(
  "/orgs/:orgId/token-usage/hourly",
  zValidator("param", tokenUsageOrgParamsSchema, validationErrorResponse),
  zValidator("query", tokenUsageHourlyQuerySchema, validationErrorResponse),
  (c) => listTokenUsageHourlyHandler(c, c.req.valid("param"), c.req.valid("query")),
);

tokenUsageRouter.post(
  "/orgs/:orgId/token-usage/hourly",
  zValidator("param", tokenUsageOrgParamsSchema, validationErrorResponse),
  zValidator("json", upsertTokenUsageHourlyBodySchema, validationErrorResponse),
  (c) => upsertTokenUsageHourlyHandler(c, c.req.valid("param"), c.req.valid("json")),
);
