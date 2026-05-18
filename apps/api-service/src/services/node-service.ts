import { and, eq, inArray, or } from "drizzle-orm";

import { signRelayToken } from "@/auth/security";
import type { AppDb } from "@/db/client";
import { nodes, organizationMembers } from "@/db/schema";
import {
  NodeDeletePermissionRequiredError,
  NodeNotFoundError,
  OrganizationMembershipRequiredError,
  OrganizationNodePermissionRequiredError,
} from "@/errors";
import { newId } from "@/lib/id";
import type { OrganizationService } from "@/services/organization-service";
import type { ServiceConfig } from "@/types";

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
  isOnline: boolean;
};

type RegisterNodeInput = {
  actorUserId: string;
  nodeId: string;
  name: string;
  scope: NodeScope;
  endpoint?: string | null;
  metadata?: Record<string, unknown>;
  updateIfExists?: boolean;
};

/** Shape of one entry in the relay `/api/v1/metrics` connectedSessions array. */
type RelaySession = {
  nodeId: string;
  daemonVersion?: string;
};

function isRelaySession(value: unknown): value is RelaySession {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).nodeId === "string";
}

export class NodeService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
    private readonly config: ServiceConfig,
  ) {}

  private async getConnectedNodeSessions(): Promise<Map<string, string>> {
    const relayUrl = this.config.relayUrl?.trim();
    const relayApiToken = this.config.relayApiToken?.trim();

    const result = new Map<string, string>();

    if (!relayUrl || !relayApiToken) {
      return result;
    }

    try {
      const response = await fetch(new URL("/api/v1/metrics", relayUrl), {
        headers: {
          Authorization: `Bearer ${relayApiToken}`,
        },
      });

      if (!response.ok) {
        return result;
      }

      const body = (await response.json()) as { connectedSessions?: unknown; connectedNodes?: unknown };

      // Prefer the richer connectedSessions view when available.
      if (Array.isArray(body.connectedSessions)) {
        for (const s of body.connectedSessions) {
          if (isRelaySession(s)) {
            const daemonVersion = s.daemonVersion ?? "";
            result.set(s.nodeId, daemonVersion);
          }
        }
        return result;
      }

      // Fallback: older relay metrics only provided connectedNodes (ids)
      if (Array.isArray(body.connectedNodes)) {
        for (const val of body.connectedNodes) {
          if (typeof val === "string") {
            result.set(val, "");
          }
        }
      }

      return result;
    } catch (error) {
      console.warn("[NodeService] Failed to fetch relay metrics — treating all nodes as offline:", error);
      return result;
    }
  }

  private normalizeMetadata(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  async listNodes(input: { actorUserId: string; organizationId: string }): Promise<NodeView[]> {
    const actorRole = await this.organizationService.getMembershipRole({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });

    if (!actorRole) {
      throw new OrganizationMembershipRequiredError();
    }

    const orgMemberUserIds = await this.organizationService.getOrganizationMemberUserIds(input.organizationId);
    if (orgMemberUserIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(nodes)
      .where(
        or(
          and(eq(nodes.scope, "shared"), eq(nodes.organizationId, input.organizationId)),
          and(eq(nodes.scope, "private"), inArray(nodes.ownerUserId, orgMemberUserIds)),
        ),
      );

    const connectedNodeDaemonVersions = await this.getConnectedNodeSessions();

    return rows.map((row) => {
      const isOnline = connectedNodeDaemonVersions.has(row.id);
      const liveDaemonVersion = isOnline ? (connectedNodeDaemonVersions.get(row.id) ?? "") : "";
      const baseMetadata = this.normalizeMetadata(row.metadata) ?? {};

      // For online nodes, prefer the live daemon version reported by the relay session
      // over the potentially stale version stored in the DB metadata.
      if (isOnline && liveDaemonVersion) {
        baseMetadata["version"] = liveDaemonVersion;
      }

      return {
        ...row,
        canUse: row.scope === "shared" || row.ownerUserId === input.actorUserId,
        scope: row.scope,
        isOnline,
        metadata: Object.keys(baseMetadata).length === 0 ? null : baseMetadata,
      };
    });
  }

  async registerNode(input: RegisterNodeInput): Promise<NodeView> {
    const shouldUpdate = input.updateIfExists !== false;
    const now = new Date();
    const insertValues = {
      id: input.nodeId,
      name: input.name,
      scope: input.scope,
      endpoint: input.endpoint ?? null,
      metadata: input.metadata ?? null,
      ownerUserId: input.actorUserId,
      organizationId: null,
      createdByUserId: input.actorUserId,
      updatedAt: now,
    };

    let resultRows: (typeof nodes.$inferSelect)[];

    if (shouldUpdate) {
      resultRows = await this.db
        .insert(nodes)
        .values(insertValues)
        .onConflictDoUpdate({
          target: nodes.id,
          set: {
            name: input.name,
            scope: input.scope,
            endpoint: input.endpoint ?? null,
            metadata: input.metadata ?? null,
            ownerUserId: input.actorUserId,
            organizationId: null,
            updatedAt: now,
          },
        })
        .returning();
    } else {
      resultRows = await this.db
        .insert(nodes)
        .values(insertValues)
        .onConflictDoNothing({ target: nodes.id })
        .returning();

      // If conflict occurred, returning() is empty — fetch the existing row.
      if (resultRows.length === 0) {
        resultRows = await this.db.select().from(nodes).where(eq(nodes.id, input.nodeId)).limit(1);
      }
    }

    const node = resultRows[0];
    if (!node) {
      throw new Error("Failed to register node");
    }

    return {
      ...node,
      canUse: true,
      metadata: this.normalizeMetadata(node.metadata),
      scope: node.scope,
      isOnline: false,
    };
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
            eq(organizationMembers.userId, input.actorUserId),
          ),
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
          organizationId: nodes.organizationId,
        })
        .from(nodes)
        .where(eq(nodes.id, input.nodeId))
        .limit(1);

      const node = existingRows[0];
      if (!node) {
        throw new NodeNotFoundError(input.nodeId);
      }

      if (node.scope === "private") {
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
              eq(organizationMembers.userId, ownerUserId),
            ),
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

  async issueRelayToken(input: {
    actorUserId: string;
    nodeId: string;
  }): Promise<{ token: string; expiresAt: string }> {
    const rows = await this.db
      .select({ id: nodes.id, ownerUserId: nodes.ownerUserId })
      .from(nodes)
      .where(eq(nodes.id, input.nodeId))
      .limit(1);

    const node = rows[0];
    if (!node) {
      throw new NodeNotFoundError(input.nodeId);
    }

    if (node.ownerUserId !== input.actorUserId) {
      throw new NodeDeletePermissionRequiredError();
    }

    return signRelayToken(
      {
        sub: input.actorUserId,
        nodeId: input.nodeId,
        iss: this.config.jwtIssuer,
        aud: this.config.jwtAudience,
      },
      this.config.jwtAccessSecret,
    );
  }
}
