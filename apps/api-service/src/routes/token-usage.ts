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
const router = new Hono<AppEnv>();

router.use("/*", requireOrganizationMemberFromParam);

router.get(
  "/token-usage/hourly",
  zValidator("param", tokenUsageOrgParamsSchema, validationErrorResponse),
  zValidator("query", tokenUsageHourlyQuerySchema, validationErrorResponse),
  (c) => listTokenUsageHourlyHandler(c, c.req.valid("param"), c.req.valid("query")),
);

router.post(
  "/token-usage/hourly",
  zValidator("param", tokenUsageOrgParamsSchema, validationErrorResponse),
  zValidator("json", upsertTokenUsageHourlyBodySchema, validationErrorResponse),
  (c) => upsertTokenUsageHourlyHandler(c, c.req.valid("param"), c.req.valid("json")),
);

tokenUsageRouter.route("/orgs/:orgId", router);
