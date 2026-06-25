import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { listWorkspacePullRequestsHandler, upsertWorkspacePullRequestHandler } from "@/handlers/workspace-pull-request";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import { upsertWorkspacePullRequestBodySchema, workspacePullRequestParamsSchema } from "@/validation/project";

export const workspacePullRequestRouter = new Hono<AppEnv>();

workspacePullRequestRouter.use("/*", requireOrganizationMemberFromParam);

workspacePullRequestRouter.get(
  "/",
  zValidator("param", workspacePullRequestParamsSchema, validationErrorResponse),
  (c) => listWorkspacePullRequestsHandler(c, c.req.valid("param")),
);

workspacePullRequestRouter.put(
  "/",
  zValidator("param", workspacePullRequestParamsSchema, validationErrorResponse),
  zValidator("json", upsertWorkspacePullRequestBodySchema, validationErrorResponse),
  (c) => upsertWorkspacePullRequestHandler(c, c.req.valid("param"), c.req.valid("json")),
);
