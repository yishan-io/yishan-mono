import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  deleteNodeHandler,
  listNodesHandler,
  registerNodeHandler
} from "@/handlers/node";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import {
  organizationNodeDeleteParamsSchema,
  organizationNodeParamsSchema,
  registerNodeBodySchema
} from "@/validation/node";

export const nodeRouter = new Hono<AppEnv>();
const orgNodesRouter = new Hono<AppEnv>();

orgNodesRouter.use("/*", requireOrganizationMemberFromParam);

orgNodesRouter.get(
  "/",
  zValidator("param", organizationNodeParamsSchema, validationErrorResponse),
  (c) => listNodesHandler(c, c.req.valid("param"))
);

orgNodesRouter.delete(
  "/:nodeId",
  zValidator("param", organizationNodeDeleteParamsSchema, validationErrorResponse),
  (c) => deleteNodeHandler(c, c.req.valid("param"))
);

nodeRouter.route("/orgs/:orgId/nodes", orgNodesRouter);

nodeRouter.post(
  "/nodes/register",
  zValidator("json", registerNodeBodySchema, validationErrorResponse),
  (c) => registerNodeHandler(c, c.req.valid("json"))
);
