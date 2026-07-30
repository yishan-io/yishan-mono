import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { exportCsvHandler } from "@/handlers/organization-export";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import { organizationExportOrgParamsSchema, organizationExportQuerySchema } from "@/validation/organization-export";

/** Router for organization-scoped CSV export downloads. */
export const organizationExportRouter = new Hono<AppEnv>();
const router = new Hono<AppEnv>();

router.use("/*", requireOrganizationMemberFromParam);

router.get(
  "/",
  zValidator("param", organizationExportOrgParamsSchema, validationErrorResponse),
  zValidator("query", organizationExportQuerySchema, validationErrorResponse),
  (c) => exportCsvHandler(c, c.req.valid("param"), c.req.valid("query")),
);

organizationExportRouter.route("/orgs/:orgId/export", router);
