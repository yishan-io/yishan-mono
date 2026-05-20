import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  createScheduledJobHandler,
  deleteScheduledJobHandler,
  disableScheduledJobHandler,
  listScheduledJobRunsHandler,
  listScheduledJobsHandler,
  pauseScheduledJobHandler,
  resumeScheduledJobHandler,
  runScheduledJobNowHandler,
  updateScheduledJobHandler
} from "@/handlers/scheduled-job";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import {
  createScheduledJobBodySchema,
  scheduledJobListQuerySchema,
  scheduledJobOrgParamsSchema,
  scheduledJobParamsSchema,
  scheduledJobRunsQuerySchema,
  updateScheduledJobBodySchema
} from "@/validation/scheduled-job";

export const scheduledJobRouter = new Hono<AppEnv>();

scheduledJobRouter.use("/*", requireOrganizationMemberFromParam);

scheduledJobRouter.get(
  "/",
  zValidator("param", scheduledJobOrgParamsSchema, validationErrorResponse),
  zValidator("query", scheduledJobListQuerySchema, validationErrorResponse),
  (c) => listScheduledJobsHandler(c, c.req.valid("param"), c.req.valid("query"))
);

scheduledJobRouter.post(
  "/",
  zValidator("param", scheduledJobOrgParamsSchema, validationErrorResponse),
  zValidator("json", createScheduledJobBodySchema, validationErrorResponse),
  (c) => createScheduledJobHandler(c, c.req.valid("param"), c.req.valid("json"))
);

scheduledJobRouter.put(
  "/:jobId",
  zValidator("param", scheduledJobParamsSchema, validationErrorResponse),
  zValidator("json", updateScheduledJobBodySchema, validationErrorResponse),
  (c) => updateScheduledJobHandler(c, c.req.valid("param"), c.req.valid("json"))
);

scheduledJobRouter.put(
  "/:jobId/pause",
  zValidator("param", scheduledJobParamsSchema, validationErrorResponse),
  (c) => pauseScheduledJobHandler(c, c.req.valid("param"))
);

scheduledJobRouter.put(
  "/:jobId/resume",
  zValidator("param", scheduledJobParamsSchema, validationErrorResponse),
  (c) => resumeScheduledJobHandler(c, c.req.valid("param"))
);

scheduledJobRouter.put(
  "/:jobId/disable",
  zValidator("param", scheduledJobParamsSchema, validationErrorResponse),
  (c) => disableScheduledJobHandler(c, c.req.valid("param"))
);

scheduledJobRouter.delete(
  "/:jobId",
  zValidator("param", scheduledJobParamsSchema, validationErrorResponse),
  (c) => deleteScheduledJobHandler(c, c.req.valid("param"))
);

scheduledJobRouter.get(
  "/:jobId/runs",
  zValidator("param", scheduledJobParamsSchema, validationErrorResponse),
  zValidator("query", scheduledJobRunsQuerySchema, validationErrorResponse),
  (c) => listScheduledJobRunsHandler(c, c.req.valid("param"), c.req.valid("query"))
);

scheduledJobRouter.post(
  "/:jobId/run-now",
  zValidator("param", scheduledJobParamsSchema, validationErrorResponse),
  (c) => runScheduledJobNowHandler(c, c.req.valid("param"))
);
