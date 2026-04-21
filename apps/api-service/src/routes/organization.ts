import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  addOrganizationMemberHandler,
  createOrganizationHandler,
  deleteOrganizationHandler,
  listOrganizationsHandler,
  removeOrganizationMemberHandler
} from "@/handlers/organization";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import {
  addOrganizationMemberBodySchema,
  createOrganizationBodySchema,
  organizationParamsSchema,
  removeOrganizationMemberParamsSchema
} from "@/validation/organization";
import { validationErrorResponse } from "@/validation/error-response";

export const organizationRouter = new Hono<AppEnv>();

organizationRouter.get("/orgs", listOrganizationsHandler);
organizationRouter.post(
  "/orgs",
  zValidator("json", createOrganizationBodySchema, validationErrorResponse),
  (c) => createOrganizationHandler(c, c.req.valid("json"))
);
organizationRouter.delete(
  "/orgs/:orgId",
  requireOrganizationMemberFromParam,
  zValidator("param", organizationParamsSchema, validationErrorResponse),
  (c) => deleteOrganizationHandler(c, c.req.valid("param"))
);
organizationRouter.post(
  "/orgs/:orgId/members",
  requireOrganizationMemberFromParam,
  zValidator("param", organizationParamsSchema, validationErrorResponse),
  zValidator("json", addOrganizationMemberBodySchema, validationErrorResponse),
  (c) => addOrganizationMemberHandler(c, c.req.valid("param"), c.req.valid("json"))
);
organizationRouter.delete(
  "/orgs/:orgId/members/:userId",
  requireOrganizationMemberFromParam,
  zValidator("param", removeOrganizationMemberParamsSchema, validationErrorResponse),
  (c) => removeOrganizationMemberHandler(c, c.req.valid("param"))
);
