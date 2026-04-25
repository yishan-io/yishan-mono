import { and, eq, inArray, or } from "drizzle-orm";

import type { AppDb, AppDbWs } from "@/db/client";
import { nodes, organizationMembers } from "@/db/schema";
import {
  NodeDeletePermissionRequiredError,
  NodeNotFoundError,
  OrganizationNodePermissionRequiredError,
  OrganizationMembershipRequiredError
} from "@/errors";
import { newId } from "@/lib/id";
import type { OrganizationService } from "@/services/organization-service";

type NodeScope = "private" | "shared";

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

type RegisterNodeInput = {
  actorUserId: string;
  nodeId: string;
  name: string;
  scope: NodeScope;
  endpoint?: string | null;
  metadata?: Record<string, unknown>;
};

export class NodeService {
  constructor(
    private readonly db: AppDb,
    private readonly dbWs: AppDbWs,
    private readonly organizationService: OrganizationService
  ) {}

  private normalizeMetadata(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private isPrivateScope(scope: string | null | undefined): boolean {
    return scope === "private" || scope === "local";
  }

  private isSharedScope(scope: string | null | undefined): boolean {
    return scope === "shared" || scope === "remote";
  }

  private normalizeScope(scope: string): NodeScope {
    if (this.isSharedScope(scope)) {
      return "shared";
    }

    return "private";
  }

  async createNode(input: CreateNodeInput): Promise<NodeView> {
    return this.dbWs.transaction(async (tx) => {
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

      if (input.scope === "shared") {
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
        .returning();

      const node = insertedRows[0];
      if (!node) {
        throw new Error("Failed to create node");
      }

      return {
        ...node,
        canUse: true,
        metadata: this.normalizeMetadata(node.metadata),
        scope: this.normalizeScope(node.scope)
      };
    });
  }

  async listNodes(input: { actorUserId: string; organizationId: string }): Promise<NodeView[]> {
    const actorRole = await this.organizationService.getMembershipRole({
      organizationId: input.organizationId,
      userId: input.actorUserId
    });

    if (!actorRole) {
      throw new OrganizationMembershipRequiredError();
    }

    const orgMemberUserIds = await this.organizationService.getOrganizationMemberUserIds(
      input.organizationId
    );
    if (orgMemberUserIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(nodes)
      .where(
        or(
          and(eq(nodes.scope, "shared"), eq(nodes.organizationId, input.organizationId)),
          and(inArray(nodes.scope, ["private", "local"]), inArray(nodes.ownerUserId, orgMemberUserIds)),
          and(eq(nodes.scope, "remote"), eq(nodes.organizationId, input.organizationId))
        )
      );

    return rows.map((row) => ({
      ...row,
      canUse: this.isSharedScope(row.scope) || row.ownerUserId === input.actorUserId,
      metadata: this.normalizeMetadata(row.metadata),
      scope: this.normalizeScope(row.scope)
    }));
  }

  async registerNode(input: RegisterNodeInput): Promise<NodeView> {
    const now = new Date();
    const upsertedRows = await this.dbWs
      .insert(nodes)
      .values({
        id: input.nodeId,
        name: input.name,
        scope: input.scope,
        endpoint: input.endpoint ?? null,
        metadata: input.metadata ?? null,
        ownerUserId: input.actorUserId,
        organizationId: null,
        createdByUserId: input.actorUserId,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: nodes.id,
        set: {
          name: input.name,
          scope: input.scope,
          endpoint: input.endpoint ?? null,
          metadata: input.metadata ?? null,
          ownerUserId: input.actorUserId,
          organizationId: null,
          updatedAt: now
        }
      })
      .returning();

    const node = upsertedRows[0];
    if (!node) {
      throw new Error("Failed to register node");
    }

    return {
      ...node,
      canUse: true,
      metadata: this.normalizeMetadata(node.metadata),
      scope: this.normalizeScope(node.scope)
    };
  }

  async deleteNode(input: {
    organizationId: string;
    nodeId: string;
    actorUserId: string;
  }): Promise<void> {
    await this.dbWs.transaction(async (tx) => {
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

      if (this.isPrivateScope(node.scope)) {
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
