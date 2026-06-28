import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  closeWorkspaceHandler,
  createWorkspaceHandler,
  listWorkspacesHandler,
  updateWorkspaceHandler,
} from "@/handlers/workspace";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import {
  closeWorkspaceBodySchema,
  createWorkspaceBodySchema,
  projectWorkspaceParamsSchema,
  updateWorkspaceBodySchema,
  updateWorkspaceParamsSchema,
} from "@/validation/project";

export const workspaceRouter = new Hono<AppEnv>();

workspaceRouter.use("/*", requireOrganizationMemberFromParam);

workspaceRouter.get("/", zValidator("param", projectWorkspaceParamsSchema, validationErrorResponse), (c) =>
  listWorkspacesHandler(c, c.req.valid("param")),
);

workspaceRouter.post(
  "/",
  zValidator("param", projectWorkspaceParamsSchema, validationErrorResponse),
  zValidator("json", createWorkspaceBodySchema, validationErrorResponse),
  (c) => createWorkspaceHandler(c, c.req.valid("param"), c.req.valid("json")),
);

workspaceRouter.patch(
  "/close",
  zValidator("param", projectWorkspaceParamsSchema, validationErrorResponse),
  zValidator("json", closeWorkspaceBodySchema, validationErrorResponse),
  (c) => closeWorkspaceHandler(c, c.req.valid("param"), c.req.valid("json")),
);

workspaceRouter.patch(
  "/:workspaceId",
  zValidator("param", updateWorkspaceParamsSchema, validationErrorResponse),
  zValidator("json", updateWorkspaceBodySchema, validationErrorResponse),
  (c) => updateWorkspaceHandler(c, c.req.valid("param"), c.req.valid("json")),
);
