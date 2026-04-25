import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  createProjectHandler,
  deleteProjectHandler,
  listProjectsHandler
} from "@/handlers/project";
import { createWorkspaceHandler, listWorkspacesHandler } from "@/handlers/workspace";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import {
  createProjectBodySchema,
  createWorkspaceBodySchema,
  organizationProjectParamsSchema,
  projectWorkspaceParamsSchema
} from "@/validation/project";

export const projectRouter = new Hono<AppEnv>();
const organizationProjectsRouter = new Hono<AppEnv>();
const projectWorkspacesRouter = new Hono<AppEnv>();

organizationProjectsRouter.use("/*", requireOrganizationMemberFromParam);

organizationProjectsRouter.get(
  "/",
  zValidator("param", organizationProjectParamsSchema, validationErrorResponse),
  (c) => listProjectsHandler(c, c.req.valid("param"))
);

organizationProjectsRouter.post(
  "/",
  zValidator("param", organizationProjectParamsSchema, validationErrorResponse),
  zValidator("json", createProjectBodySchema, validationErrorResponse),
  (c) => createProjectHandler(c, c.req.valid("param"), c.req.valid("json"))
);

organizationProjectsRouter.delete(
  "/:projectId",
  zValidator("param", projectWorkspaceParamsSchema, validationErrorResponse),
  (c) => deleteProjectHandler(c, c.req.valid("param"))
);

projectWorkspacesRouter.use("/*", requireOrganizationMemberFromParam);

projectWorkspacesRouter.get(
  "/",
  zValidator("param", projectWorkspaceParamsSchema, validationErrorResponse),
  (c) => listWorkspacesHandler(c, c.req.valid("param"))
);

projectWorkspacesRouter.post(
  "/",
  zValidator("param", projectWorkspaceParamsSchema, validationErrorResponse),
  zValidator("json", createWorkspaceBodySchema, validationErrorResponse),
  (c) => createWorkspaceHandler(c, c.req.valid("param"), c.req.valid("json"))
);

projectRouter.route("/orgs/:orgId/projects", organizationProjectsRouter);
projectRouter.route("/orgs/:orgId/projects/:projectId/workspaces", projectWorkspacesRouter);
