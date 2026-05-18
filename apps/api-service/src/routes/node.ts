import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { deleteNodeHandler, listNodesHandler, registerNodeHandler, relayTokenHandler } from "@/handlers/node";
import { completeScheduledJobRunHandler, startScheduledJobRunHandler } from "@/handlers/scheduled-job";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import {
  nodeParamsSchema,
  organizationNodeDeleteParamsSchema,
  organizationNodeParamsSchema,
  registerNodeBodySchema,
} from "@/validation/node";
import {
  completeScheduledJobRunBodySchema,
  nodeScheduledJobParamsSchema,
  startScheduledJobRunBodySchema,
} from "@/validation/scheduled-job";

export const nodeRouter = new Hono<AppEnv>();
const orgNodesRouter = new Hono<AppEnv>();

orgNodesRouter.use("/*", requireOrganizationMemberFromParam);

orgNodesRouter.get("/", zValidator("param", organizationNodeParamsSchema, validationErrorResponse), (c) =>
  listNodesHandler(c, c.req.valid("param")),
);

orgNodesRouter.delete(
  "/:nodeId",
  zValidator("param", organizationNodeDeleteParamsSchema, validationErrorResponse),
  (c) => deleteNodeHandler(c, c.req.valid("param")),
);

nodeRouter.route("/orgs/:orgId/nodes", orgNodesRouter);

nodeRouter.post("/nodes/register", zValidator("json", registerNodeBodySchema, validationErrorResponse), (c) =>
  registerNodeHandler(c, c.req.valid("json")),
);

nodeRouter.put(
  "/nodes/:nodeId/scheduled-jobs/runs/start",
  zValidator("param", nodeScheduledJobParamsSchema, validationErrorResponse),
  zValidator("json", startScheduledJobRunBodySchema, validationErrorResponse),
  (c) => startScheduledJobRunHandler(c, c.req.valid("param"), c.req.valid("json")),
);

nodeRouter.put(
  "/nodes/:nodeId/scheduled-jobs/runs/complete",
  zValidator("param", nodeScheduledJobParamsSchema, validationErrorResponse),
  zValidator("json", completeScheduledJobRunBodySchema, validationErrorResponse),
  (c) => completeScheduledJobRunHandler(c, c.req.valid("param"), c.req.valid("json")),
);

nodeRouter.post("/nodes/:nodeId/relay-token", zValidator("param", nodeParamsSchema, validationErrorResponse), (c) =>
  relayTokenHandler(c, c.req.valid("param")),
);
