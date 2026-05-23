import { and, eq, inArray } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { organizationMembers, organizations, users } from "@/db/schema";
import type { OrganizationMemberRole, OrganizationPlan } from "@/db/schema";
import {
  InvalidOrganizationMemberRoleError,
  InvalidOrganizationMembersError,
  OrganizationLastOwnerLeaveError,
  OrganizationManageMembersPermissionRequiredError,
  OrganizationMemberAlreadyExistsError,
  OrganizationMemberNotFoundError,
  OrganizationMembershipRequiredError,
  OrganizationNotFoundError,
  OrganizationOwnerRemovalNotAllowedError,
  OrganizationOwnerRequiredError,
} from "@/errors";
import { newId } from "@/lib/id";
import type { OrganizationInviteService, OrganizationInviteView } from "@/services/organization-invite-service";
import type { UserService } from "@/services/user-service";

type CreateOrganizationInput = {
  name: string;
  actorUserId: string;
  memberUserIds: string[];
};

export type OrganizationMemberView = {
  userId: string;
  role: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

/**
 * Discriminated result from `addOrganizationMember`.
 * When the target email is not yet registered, an invite is sent instead and
 * `kind` is `"invited"`.
 */
export type AddOrganizationMemberResult =
  | { kind: "added"; member: OrganizationMemberView }
  | { kind: "invited"; invite: OrganizationInviteView };

type OrganizationView = {
  id: string;
  name: string;
  plan: OrganizationPlan;
  createdAt: Date;
  updatedAt: Date;
  members: OrganizationMemberView[];
};

export class OrganizationService {
  constructor(
    private readonly db: AppDb,
    private readonly userService: UserService,
    private readonly inviteService: OrganizationInviteService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  private async assertOrganizationExists(organizationId: string): Promise<void> {
    const rows = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (rows.length === 0) {
      throw new OrganizationNotFoundError(organizationId);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async listOrganizationMembers(input: {
    organizationId: string;
    actorUserId: string;
  }): Promise<OrganizationMemberView[]> {
    const actorRole = await this.getMembershipRole({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });

    if (!actorRole) {
      throw new OrganizationMembershipRequiredError();
    }

    return this.db
      .select({
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, input.organizationId));
  }

  async getMembershipRole(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMemberRole | null> {
    const rows = await this.db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.userId)),
      )
      .limit(1);

    const role = rows[0]?.role;
    if (role === "owner" || role === "admin" || role === "member") {
      return role;
    }

    return null;
  }

  async getOrganizationMemberUserIds(organizationId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId));

    return Array.from(new Set(rows.map((row) => row.userId)));
  }

  async addOrganizationMember(input: {
    organizationId: string;
    actorUserId: string;
    memberEmail: string;
    role: "member" | "admin";
  }): Promise<AddOrganizationMemberResult> {
    await this.assertOrganizationExists(input.organizationId);

    // Resolve email → user. If the user does not yet have an account, send an
    // invite email so they can register and be auto-joined on signup.
    const targetUser = await this.userService.getByEmail(input.memberEmail);
    if (!targetUser) {
      const invite = await this.inviteService.createInvite({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        email: input.memberEmail,
        role: input.role,
      });
      return { kind: "invited", invite };
    }

    const member = await this.db.transaction(async (tx) => {
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
      if (actorRole !== "owner" && actorRole !== "admin") {
        throw new OrganizationManageMembersPermissionRequiredError();
      }

      if (input.role !== "member" && input.role !== "admin") {
        throw new InvalidOrganizationMemberRoleError(input.role);
      }

      const existingMembershipRows = await tx
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.userId, targetUser.id),
          ),
        )
        .limit(1);

      if (existingMembershipRows.length > 0) {
        throw new OrganizationMemberAlreadyExistsError(targetUser.id);
      }

      await tx.insert(organizationMembers).values({
        id: newId(),
        organizationId: input.organizationId,
        userId: targetUser.id,
        role: input.role,
      });

      // Build return value from already-fetched user data — no second SELECT needed.
      return {
        userId: targetUser.id,
        role: input.role,
        email: targetUser.email,
        name: targetUser.name,
        avatarUrl: targetUser.avatarUrl,
      };
    });

    return { kind: "added", member };
  }

  async removeOrganizationMember(input: {
    organizationId: string;
    actorUserId: string;
    memberUserId: string;
  }): Promise<void> {
    await this.assertOrganizationExists(input.organizationId);
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
      if (actorRole !== "owner" && actorRole !== "admin") {
        throw new OrganizationManageMembersPermissionRequiredError();
      }

      const targetMembershipRows = await tx
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.userId, input.memberUserId),
          ),
        )
        .limit(1);

      const targetRole = targetMembershipRows[0]?.role as OrganizationMemberRole | undefined;
      if (!targetRole) {
        throw new OrganizationMemberNotFoundError(input.memberUserId);
      }

      if (targetRole === "owner") {
        throw new OrganizationOwnerRemovalNotAllowedError();
      }

      await tx
        .delete(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.userId, input.memberUserId),
          ),
        );
    });
  }

  async leaveOrganization(input: { organizationId: string; actorUserId: string }): Promise<void> {
    await this.assertOrganizationExists(input.organizationId);
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
        throw new OrganizationMemberNotFoundError(input.actorUserId);
      }

      if (actorRole === "owner") {
        // The owner role is only ever assigned at org creation; there is no API
        // path to promote another member to owner. So if the actor is the owner
        // and any other member exists, they are the sole owner and cannot leave.
        const allMemberRows = await tx
          .select({ userId: organizationMembers.userId })
          .from(organizationMembers)
          .where(eq(organizationMembers.organizationId, input.organizationId));

        const hasMembersOtherThanActor = allMemberRows.some((row) => row.userId !== input.actorUserId);

        if (hasMembersOtherThanActor) {
          throw new OrganizationLastOwnerLeaveError();
        }
      }

      await tx
        .delete(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.userId, input.actorUserId),
          ),
        );
    });
  }

  async deleteOrganization(input: { organizationId: string; actorUserId: string }): Promise<void> {
    await this.assertOrganizationExists(input.organizationId);
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
      if (actorRole !== "owner") {
        throw new OrganizationOwnerRequiredError();
      }

      await tx.delete(organizations).where(eq(organizations.id, input.organizationId));
    });
  }

  async createOrganization(input: CreateOrganizationInput): Promise<OrganizationView> {
    return this.db.transaction(async (tx) => {
      const normalizedUserIds = Array.from(new Set([input.actorUserId, ...input.memberUserIds]));

      const existingUsers = await tx.select({ id: users.id }).from(users).where(inArray(users.id, normalizedUserIds));

      if (existingUsers.length !== normalizedUserIds.length) {
        const existingUserIdSet = new Set(existingUsers.map((row) => row.id));
        const missingUserIds = normalizedUserIds.filter((userId) => !existingUserIdSet.has(userId));
        throw new InvalidOrganizationMembersError(missingUserIds);
      }

      const insertedOrganizations = await tx
        .insert(organizations)
        .values({ id: newId(), name: input.name })
        .returning();

      const organization = insertedOrganizations[0];
      if (!organization) {
        throw new Error("Failed to create organization");
      }

      await tx.insert(organizationMembers).values(
        normalizedUserIds.map((userId) => ({
          id: newId(),
          organizationId: organization.id,
          userId,
          role: userId === input.actorUserId ? "owner" : "member",
        })),
      );

      const members = await tx
        .select({
          userId: organizationMembers.userId,
          role: organizationMembers.role,
          email: users.email,
          name: users.name,
          avatarUrl: users.avatarUrl,
        })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(eq(organizationMembers.organizationId, organization.id));

      return { ...organization, members };
    });
  }

  async getOrganizationsForUser(userId: string): Promise<OrganizationView[]> {
    // Single JOIN from organization_members → organizations → users.
    // No need for a preliminary "which orgs does this user belong to" query.
    const memberships = await this.db
      .select({
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationPlan: organizations.plan,
        organizationCreatedAt: organizations.createdAt,
        organizationUpdatedAt: organizations.updatedAt,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(
        // Limit to orgs the requesting user belongs to.
        inArray(
          organizationMembers.organizationId,
          this.db
            .select({ organizationId: organizationMembers.organizationId })
            .from(organizationMembers)
            .where(eq(organizationMembers.userId, userId)),
        ),
      );

    if (memberships.length === 0) {
      return [];
    }

    const byOrg = new Map<string, OrganizationView>();

    for (const row of memberships) {
      const existing = byOrg.get(row.organizationId);
      const member = {
        userId: row.userId,
        role: row.role,
        email: row.email,
        name: row.name,
        avatarUrl: row.avatarUrl,
      };

      if (existing) {
        existing.members.push(member);
        continue;
      }

      byOrg.set(row.organizationId, {
        id: row.organizationId,
        name: row.organizationName,
        plan: row.organizationPlan,
        createdAt: row.organizationCreatedAt,
        updatedAt: row.organizationUpdatedAt,
        members: [member],
      });
    }

    return Array.from(byOrg.values());
  }
}
