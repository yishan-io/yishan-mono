import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  closeWorkspaceHandler,
  createWorkspaceHandler,
  listWorkspaceFilesHandler,
  listWorkspaceGitBranchesHandler,
  listWorkspaceGitChangesHandler,
  listWorkspaceTerminalSessionsHandler,
  listWorkspacesHandler,
  readWorkspaceDiffHandler,
  readWorkspaceFileHandler,
  refreshWorkspacePullRequestHandler,
  startWorkspaceTerminalHandler,
  stopWorkspaceTerminalHandler,
  updateWorkspaceHandler,
} from "@/handlers/workspace";
import { workspaceFrontendEventsStreamHandler } from "@/handlers/workspace-frontend-events-stream";
import { workspaceTerminalStreamHandler } from "@/handlers/workspace-terminal-stream";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import {
  closeWorkspaceBodySchema,
  createWorkspaceBodySchema,
  projectWorkspaceParamsSchema,
  workspaceFileDiffParamsSchema,
  workspaceFileDiffQuerySchema,
  workspaceFileListParamsSchema,
  workspaceFileListQuerySchema,
  workspaceFileReadParamsSchema,
  workspaceFileReadQuerySchema,
  workspaceGitBranchesParamsSchema,
  workspaceGitChangesParamsSchema,
  workspacePullRequestParamsSchema,
  workspaceTerminalListQuerySchema,
  workspaceTerminalParamsSchema,
  workspaceTerminalSessionParamsSchema,
  workspaceTerminalStartBodySchema,
  updateWorkspaceBodySchema,
  updateWorkspaceParamsSchema,
} from "@/validation/project";

export const workspaceRouter = new Hono<AppEnv>();

workspaceRouter.use("/*", requireOrganizationMemberFromParam);

workspaceRouter.get("/", zValidator("param", projectWorkspaceParamsSchema, validationErrorResponse), (c) =>
  listWorkspacesHandler(c, c.req.valid("param")),
);

workspaceRouter.get(
  "/:workspaceId/files",
  zValidator("param", workspaceFileListParamsSchema, validationErrorResponse),
  zValidator("query", workspaceFileListQuerySchema, validationErrorResponse),
  (c) => listWorkspaceFilesHandler(c, c.req.valid("param"), c.req.valid("query")),
);

workspaceRouter.get(
  "/:workspaceId/files/diff",
  zValidator("param", workspaceFileDiffParamsSchema, validationErrorResponse),
  zValidator("query", workspaceFileDiffQuerySchema, validationErrorResponse),
  (c) => readWorkspaceDiffHandler(c, c.req.valid("param"), c.req.valid("query")),
);

workspaceRouter.get(
  "/:workspaceId/files/read",
  zValidator("param", workspaceFileReadParamsSchema, validationErrorResponse),
  zValidator("query", workspaceFileReadQuerySchema, validationErrorResponse),
  (c) => readWorkspaceFileHandler(c, c.req.valid("param"), c.req.valid("query")),
);

workspaceRouter.get(
  "/:workspaceId/git/branches",
  zValidator("param", workspaceGitBranchesParamsSchema, validationErrorResponse),
  (c) => listWorkspaceGitBranchesHandler(c, c.req.valid("param")),
);

workspaceRouter.get(
  "/:workspaceId/changes",
  zValidator("param", workspaceGitChangesParamsSchema, validationErrorResponse),
  (c) => listWorkspaceGitChangesHandler(c, c.req.valid("param")),
);

workspaceRouter.post(
  "/:workspaceId/pull-request/refresh",
  zValidator("param", workspacePullRequestParamsSchema, validationErrorResponse),
  (c) => refreshWorkspacePullRequestHandler(c, c.req.valid("param")),
);

workspaceRouter.get(
  "/:workspaceId/terminal/sessions",
  zValidator("param", workspaceTerminalParamsSchema, validationErrorResponse),
  zValidator("query", workspaceTerminalListQuerySchema, validationErrorResponse),
  (c) => listWorkspaceTerminalSessionsHandler(c, c.req.valid("param"), c.req.valid("query")),
);

workspaceRouter.post(
  "/:workspaceId/terminal/sessions",
  zValidator("param", workspaceTerminalParamsSchema, validationErrorResponse),
  zValidator("json", workspaceTerminalStartBodySchema, validationErrorResponse),
  (c) => startWorkspaceTerminalHandler(c, c.req.valid("param"), c.req.valid("json")),
);

workspaceRouter.get(
  "/:workspaceId/events/ws",
  zValidator("param", workspaceTerminalParamsSchema, validationErrorResponse),
  workspaceFrontendEventsStreamHandler,
);

workspaceRouter.get(
  "/:workspaceId/terminal/sessions/:sessionId/ws",
  zValidator("param", workspaceTerminalSessionParamsSchema, validationErrorResponse),
  workspaceTerminalStreamHandler,
);

workspaceRouter.delete(
  "/:workspaceId/terminal/sessions/:sessionId",
  zValidator("param", workspaceTerminalSessionParamsSchema, validationErrorResponse),
  (c) => stopWorkspaceTerminalHandler(c, c.req.valid("param")),
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
