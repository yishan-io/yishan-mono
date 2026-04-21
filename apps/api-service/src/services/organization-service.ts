import { and, eq, inArray } from "drizzle-orm";

import type { AppDb } from "../db/client";
import { organizationMembers, organizations, users } from "../db/schema";
import {
  InvalidOrganizationMembersError,
  OrganizationNotFoundError,
  OrganizationOwnerRequiredError
} from "../errors";
import { newId } from "../lib/id";

type CreateOrganizationInput = {
  name: string;
  actorUserId: string;
  memberUserIds: string[];
};

type OrganizationMemberView = {
  userId: string;
  role: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

type OrganizationView = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  members: OrganizationMemberView[];
};

export class OrganizationService {
  constructor(private readonly db: AppDb) {}

  async deleteOrganization(input: { organizationId: string; actorUserId: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existingOrganizationRows = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);

      if (existingOrganizationRows.length === 0) {
        throw new OrganizationNotFoundError(input.organizationId);
      }

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
      if (actorRole !== "owner") {
        throw new OrganizationOwnerRequiredError();
      }

      await tx.delete(organizations).where(eq(organizations.id, input.organizationId));
    });
  }

  async createOrganization(input: CreateOrganizationInput): Promise<OrganizationView> {
    return this.db.transaction(async (tx) => {
      const normalizedUserIds = Array.from(new Set([input.actorUserId, ...input.memberUserIds]));

      const existingUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, normalizedUserIds));

      if (existingUsers.length !== normalizedUserIds.length) {
        const existingUserIdSet = new Set(existingUsers.map((row) => row.id));
        const missingUserIds = normalizedUserIds.filter((userId) => !existingUserIdSet.has(userId));
        throw new InvalidOrganizationMembersError(missingUserIds);
      }

      const insertedOrganizations = await tx
        .insert(organizations)
        .values({
          id: newId(),
          name: input.name
        })
        .returning({
          id: organizations.id,
          name: organizations.name,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt
        });

      const organization = insertedOrganizations[0];
      if (!organization) {
        throw new Error("Failed to create organization");
      }

      await tx.insert(organizationMembers).values(
        normalizedUserIds.map((userId) => ({
          id: newId(),
          organizationId: organization.id,
          userId,
          role: userId === input.actorUserId ? "owner" : "member"
        }))
      );

      const members = await tx
        .select({
          userId: organizationMembers.userId,
          role: organizationMembers.role,
          email: users.email,
          name: users.name,
          avatarUrl: users.avatarUrl
        })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(eq(organizationMembers.organizationId, organization.id));

      return {
        ...organization,
        members
      };
    });
  }

  async getOrganizationsForUser(userId: string): Promise<OrganizationView[]> {
    const organizationRows = await this.db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));

    const organizationIds = Array.from(new Set(organizationRows.map((row) => row.organizationId)));
    if (organizationIds.length === 0) {
      return [];
    }

    const memberships = await this.db
      .select({
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationCreatedAt: organizations.createdAt,
        organizationUpdatedAt: organizations.updatedAt,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(inArray(organizationMembers.organizationId, organizationIds));

    const byOrg = new Map<string, OrganizationView>();

    for (const row of memberships) {
      const existing = byOrg.get(row.organizationId);

      const member = {
        userId: row.userId,
        role: row.role,
        email: row.email,
        name: row.name,
        avatarUrl: row.avatarUrl
      };

      if (existing) {
        existing.members.push(member);
        continue;
      }

      byOrg.set(row.organizationId, {
        id: row.organizationId,
        name: row.organizationName,
        createdAt: row.organizationCreatedAt,
        updatedAt: row.organizationUpdatedAt,
        members: [member]
      });
    }

    return Array.from(byOrg.values());
  }
}
