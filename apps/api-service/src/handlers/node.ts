import type { AppContext } from "@/hono";
import type {
  OrganizationNodeDeleteParamsInput,
  OrganizationNodeParamsInput,
  RegisterNodeBodyInput,
} from "@/validation/node";

export async function listNodesHandler(c: AppContext, params: OrganizationNodeParamsInput) {
  const actorUser = c.get("sessionUser");
  const nodes = await c.get("services").node.listNodes({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
  });
  return c.json({ nodes });
}

export async function deleteNodeHandler(c: AppContext, params: OrganizationNodeDeleteParamsInput) {
  const actorUser = c.get("sessionUser");
  await c.get("services").node.deleteNode({
    organizationId: params.orgId,
    nodeId: params.nodeId,
    actorUserId: actorUser.id,
  });

  return c.json({ ok: true });
}

export async function registerNodeHandler(c: AppContext, body: RegisterNodeBodyInput) {
  const actorUser = c.get("sessionUser");
  const node = await c.get("services").node.registerNode({
    actorUserId: actorUser.id,
    nodeId: body.nodeId,
    name: body.name,
    scope: body.scope,
    endpoint: body.endpoint,
    metadata: body.metadata,
    updateIfExists: body.updateIfExists,
  });

  return c.json({ node });
}
