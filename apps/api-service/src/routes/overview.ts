import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  getOverviewModelBreakdownHandler,
  getOverviewTokenUsageHandler,
  getOverviewWorkspaceInsightsHandler,
} from "@/handlers/overview";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import {
  overviewModelBreakdownQuerySchema,
  overviewOrgParamsSchema,
  overviewTokenUsageQuerySchema,
  overviewWorkspaceInsightsQuerySchema,
} from "@/validation/overview";

export const overviewRouter = new Hono<AppEnv>();
const router = new Hono<AppEnv>();

router.use("/*", requireOrganizationMemberFromParam);

router.get(
  "/overview/token-usage",
  zValidator("param", overviewOrgParamsSchema, validationErrorResponse),
  zValidator("query", overviewTokenUsageQuerySchema, validationErrorResponse),
  (c) => getOverviewTokenUsageHandler(c, c.req.valid("param"), c.req.valid("query")),
);

router.get(
  "/overview/model-breakdown",
  zValidator("param", overviewOrgParamsSchema, validationErrorResponse),
  zValidator("query", overviewModelBreakdownQuerySchema, validationErrorResponse),
  (c) => getOverviewModelBreakdownHandler(c, c.req.valid("param"), c.req.valid("query")),
);

router.get(
  "/overview/workspace-insights",
  zValidator("param", overviewOrgParamsSchema, validationErrorResponse),
  zValidator("query", overviewWorkspaceInsightsQuerySchema, validationErrorResponse),
  (c) => getOverviewWorkspaceInsightsHandler(c, c.req.valid("param"), c.req.valid("query")),
);

overviewRouter.route("/orgs/:orgId", router);
