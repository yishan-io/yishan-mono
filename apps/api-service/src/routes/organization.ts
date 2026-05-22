import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  addOrganizationMemberHandler,
  cancelOrganizationInviteHandler,
  createOrganizationHandler,
  deleteOrganizationHandler,
  listOrganizationInvitesHandler,
  listOrganizationMembersHandler,
  listOrganizationsHandler,
  removeOrganizationMemberHandler,
} from "@/handlers/organization";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import {
  addOrganizationMemberBodySchema,
  cancelOrganizationInviteParamsSchema,
  createOrganizationBodySchema,
  organizationParamsSchema,
  removeOrganizationMemberParamsSchema,
} from "@/validation/organization";

export const organizationRouter = new Hono<AppEnv>();

organizationRouter.get("/orgs", listOrganizationsHandler);
organizationRouter.post("/orgs", zValidator("json", createOrganizationBodySchema, validationErrorResponse), (c) =>
  createOrganizationHandler(c, c.req.valid("json")),
);
organizationRouter.delete(
  "/orgs/:orgId",
  requireOrganizationMemberFromParam,
  zValidator("param", organizationParamsSchema, validationErrorResponse),
  (c) => deleteOrganizationHandler(c, c.req.valid("param")),
);
organizationRouter.get(
  "/orgs/:orgId/members",
  requireOrganizationMemberFromParam,
  zValidator("param", organizationParamsSchema, validationErrorResponse),
  (c) => listOrganizationMembersHandler(c, c.req.valid("param")),
);
organizationRouter.post(
  "/orgs/:orgId/members",
  requireOrganizationMemberFromParam,
  zValidator("param", organizationParamsSchema, validationErrorResponse),
  zValidator("json", addOrganizationMemberBodySchema, validationErrorResponse),
  (c) => addOrganizationMemberHandler(c, c.req.valid("param"), c.req.valid("json")),
);
organizationRouter.delete(
  "/orgs/:orgId/members/:userId",
  requireOrganizationMemberFromParam,
  zValidator("param", removeOrganizationMemberParamsSchema, validationErrorResponse),
  (c) => removeOrganizationMemberHandler(c, c.req.valid("param")),
);
organizationRouter.get(
  "/orgs/:orgId/invites",
  requireOrganizationMemberFromParam,
  zValidator("param", organizationParamsSchema, validationErrorResponse),
  (c) => listOrganizationInvitesHandler(c, c.req.valid("param")),
);
organizationRouter.delete(
  "/orgs/:orgId/invites/:inviteId",
  requireOrganizationMemberFromParam,
  zValidator("param", cancelOrganizationInviteParamsSchema, validationErrorResponse),
  (c) => cancelOrganizationInviteHandler(c, c.req.valid("param")),
);
