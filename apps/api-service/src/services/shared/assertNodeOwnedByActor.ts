import { eq } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { nodes } from "@/db/schema";
import {
  NodeNotFoundError,
  WorkspaceLocalNodePermissionRequiredError,
  WorkspaceLocalNodeScopeInvalidError,
} from "@/errors";

/**
 * Throws if `nodeId` does not exist, is not private-scoped, or is not owned
 * by `actorUserId`. Call this before any operation that requires exclusive
 * node access.
 */
export async function assertNodeOwnedByActor(db: AppDb, nodeId: string, actorUserId: string): Promise<void> {
  const rows = await db
    .select({ id: nodes.id, ownerUserId: nodes.ownerUserId, scope: nodes.scope })
    .from(nodes)
    .where(eq(nodes.id, nodeId))
    .limit(1);

  const node = rows[0];
  if (!node) {
    throw new NodeNotFoundError(nodeId);
  }
  if (node.scope !== "private") {
    throw new WorkspaceLocalNodeScopeInvalidError(nodeId);
  }
  if (node.ownerUserId !== actorUserId) {
    throw new WorkspaceLocalNodePermissionRequiredError();
  }
}
