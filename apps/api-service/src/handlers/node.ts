import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type {
  CreateNodeBodyInput,
  OrganizationNodeDeleteParamsInput,
  OrganizationNodeParamsInput
} from "@/validation/node";

export async function listNodesHandler(c: AppContext, params: OrganizationNodeParamsInput) {
  const actorUser = c.get("sessionUser");
  const nodes = await c.get("services").node.listNodes({
    actorUserId: actorUser.id,
    organizationId: params.orgId
  });
  return c.json({ nodes });
}

export async function createNodeHandler(
  c: AppContext,
  params: OrganizationNodeParamsInput,
  body: CreateNodeBodyInput
) {
  const actorUser = c.get("sessionUser");
  const node = await c.get("services").node.createNode({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    name: body.name,
    scope: body.scope,
    endpoint: body.endpoint,
    metadata: body.metadata
  });

  return c.json({ node }, StatusCodes.CREATED);
}

export async function deleteNodeHandler(c: AppContext, params: OrganizationNodeDeleteParamsInput) {
  const actorUser = c.get("sessionUser");
  await c.get("services").node.deleteNode({
    organizationId: params.orgId,
    nodeId: params.nodeId,
    actorUserId: actorUser.id
  });

  return c.json({ ok: true });
}
