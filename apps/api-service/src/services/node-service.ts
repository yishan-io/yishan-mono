import { and, eq, inArray, or } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { nodes, organizationMembers } from "@/db/schema";
import {
  NodeDeletePermissionRequiredError,
  NodeNotFoundError,
  OrganizationNodePermissionRequiredError,
  OrganizationMembershipRequiredError
} from "@/errors";
import { newId } from "@/lib/id";

type NodeScope = "local" | "remote";

export type NodeView = {
  id: string;
  name: string;
  scope: NodeScope;
  endpoint: string | null;
  metadata: Record<string, unknown> | null;
  ownerUserId: string | null;
  organizationId: string | null;
  canUse: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

type CreateNodeInput = {
  actorUserId: string;
  organizationId: string;
  name: string;
  scope: NodeScope;
  endpoint?: string | null;
  metadata?: Record<string, unknown>;
};

export class NodeService {
  constructor(private readonly db: AppDb) {}

  private normalizeMetadata(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  async createNode(input: CreateNodeInput): Promise<NodeView> {
    return this.db.transaction(async (tx) => {
      const actorMembershipRows = await tx
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.userId, input.actorUserId)
          )
        )
        .limit(1);

      const actorRole = actorMembershipRows[0]?.role;
      if (!actorRole) {
        throw new OrganizationMembershipRequiredError();
      }

      let organizationId: string | null = null;
      let ownerUserId: string | null = null;

      if (input.scope === "remote") {
        if (actorRole !== "owner" && actorRole !== "admin") {
          throw new OrganizationNodePermissionRequiredError();
        }

        organizationId = input.organizationId;
      } else {
        ownerUserId = input.actorUserId;
      }

      const insertedRows = await tx
        .insert(nodes)
        .values({
          id: newId(),
          name: input.name,
          scope: input.scope,
          endpoint: input.endpoint ?? null,
          metadata: input.metadata ?? null,
          ownerUserId,
          organizationId,
          createdByUserId: input.actorUserId
        })
        .returning({
          id: nodes.id,
          name: nodes.name,
          scope: nodes.scope,
          endpoint: nodes.endpoint,
          metadata: nodes.metadata,
          ownerUserId: nodes.ownerUserId,
          organizationId: nodes.organizationId,
          createdByUserId: nodes.createdByUserId,
          createdAt: nodes.createdAt,
          updatedAt: nodes.updatedAt
        });

      const node = insertedRows[0];
      if (!node) {
        throw new Error("Failed to create node");
      }

      return {
        ...node,
        canUse: true,
        metadata: this.normalizeMetadata(node.metadata),
        scope: node.scope as NodeScope
      };
    });
  }

  async listNodes(input: { actorUserId: string; organizationId: string }): Promise<NodeView[]> {
    const actorMembershipRows = await this.db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.actorUserId)
        )
      )
      .limit(1);

    if (actorMembershipRows.length === 0) {
      throw new OrganizationMembershipRequiredError();
    }

    const orgMemberRows = await this.db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, input.organizationId));

    const orgMemberUserIds = Array.from(new Set(orgMemberRows.map((row) => row.userId)));
    if (orgMemberUserIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select({
        id: nodes.id,
        name: nodes.name,
        scope: nodes.scope,
        endpoint: nodes.endpoint,
        metadata: nodes.metadata,
        ownerUserId: nodes.ownerUserId,
        organizationId: nodes.organizationId,
        createdByUserId: nodes.createdByUserId,
        createdAt: nodes.createdAt,
        updatedAt: nodes.updatedAt
      })
      .from(nodes)
      .where(
        or(
          and(eq(nodes.scope, "remote"), eq(nodes.organizationId, input.organizationId)),
          and(eq(nodes.scope, "local"), inArray(nodes.ownerUserId, orgMemberUserIds))
        )
      );

    return rows.map((row) => ({
      ...row,
      canUse: row.scope === "remote" || row.ownerUserId === input.actorUserId,
      metadata: this.normalizeMetadata(row.metadata),
      scope: row.scope as NodeScope
    }));
  }

  async deleteNode(input: {
    organizationId: string;
    nodeId: string;
    actorUserId: string;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const actorMembershipRows = await tx
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.userId, input.actorUserId)
          )
        )
        .limit(1);

      const actorRole = actorMembershipRows[0]?.role;
      if (!actorRole) {
        throw new OrganizationMembershipRequiredError();
      }

      const existingRows = await tx
        .select({
          id: nodes.id,
          scope: nodes.scope,
          ownerUserId: nodes.ownerUserId,
          organizationId: nodes.organizationId
        })
        .from(nodes)
        .where(eq(nodes.id, input.nodeId))
        .limit(1);

      const node = existingRows[0];
      if (!node) {
        throw new NodeNotFoundError(input.nodeId);
      }

      if (node.scope === "local") {
        const ownerUserId = node.ownerUserId;
        if (!ownerUserId) {
          throw new NodeDeletePermissionRequiredError();
        }

        const ownerMembershipRows = await tx
          .select({ userId: organizationMembers.userId })
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, input.organizationId),
              eq(organizationMembers.userId, ownerUserId)
            )
          )
          .limit(1);

        if (ownerMembershipRows.length === 0) {
          throw new NodeNotFoundError(input.nodeId);
        }

        if (node.ownerUserId !== input.actorUserId) {
          throw new NodeDeletePermissionRequiredError();
        }
      } else {
        const orgId = node.organizationId;
        if (!orgId || orgId !== input.organizationId) {
          throw new NodeNotFoundError(input.nodeId);
        }

        if (actorRole !== "owner" && actorRole !== "admin") {
          throw new OrganizationNodePermissionRequiredError();
        }
      }

      await tx.delete(nodes).where(eq(nodes.id, input.nodeId));
    });
  }
}
