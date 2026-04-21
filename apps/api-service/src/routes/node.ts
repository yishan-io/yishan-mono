import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { createNodeHandler, deleteNodeHandler, listNodesHandler } from "@/handlers/node";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import {
  createNodeBodySchema,
  organizationNodeDeleteParamsSchema,
  organizationNodeParamsSchema
} from "@/validation/node";

export const nodeRouter = new Hono<AppEnv>();
const orgNodesRouter = new Hono<AppEnv>();

orgNodesRouter.use("/*", requireOrganizationMemberFromParam);

orgNodesRouter.get(
  "/",
  zValidator("param", organizationNodeParamsSchema, validationErrorResponse),
  (c) => listNodesHandler(c, c.req.valid("param"))
);
orgNodesRouter.post(
  "/",
  zValidator("param", organizationNodeParamsSchema, validationErrorResponse),
  zValidator("json", createNodeBodySchema, validationErrorResponse),
  (c) => createNodeHandler(c, c.req.valid("param"), c.req.valid("json"))
);
orgNodesRouter.delete(
  "/:nodeId",
  zValidator("param", organizationNodeDeleteParamsSchema, validationErrorResponse),
  (c) => deleteNodeHandler(c, c.req.valid("param"))
);

nodeRouter.route("/orgs/:orgId/nodes", orgNodesRouter);
