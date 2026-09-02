import { and, eq, sql } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { oauthAccounts, personalLocalTaskKeyAllocations, personalLocalTaskKeyCounters, users } from "@/db/schema";
import { LocalTaskKeyAllocationFailedError } from "@/errors";
import { newId } from "@/lib/id";
import type { NotificationPreferencesPatch } from "@/lib/notification-preferences";
import { type UserPreferences, type UserPreferencesPatch, mergeUserPreferences } from "@/lib/user-preferences";
import type { OrganizationInviteService } from "@/services/organization-invite-service";
import type { OAuthProfile } from "@/types";

export class UserService {
  private inviteService: OrganizationInviteService | null = null;

  constructor(private readonly db: AppDb) {}

  /**
   * Sets the invite service after construction to avoid a circular dependency.
   * Called by `createServices` immediately after both services are instantiated.
   */
  setInviteService(inviteService: OrganizationInviteService): void {
    this.inviteService = inviteService;
  }

  /** Allocates an idempotent API-owned Local Task key for the authenticated user's personal scope. */
  async allocatePersonalLocalTaskKey(input: { actorUserId: string; localTaskId: string }): Promise<{ key: string }> {
    try {
      return await this.db.transaction(async (tx) => {
        await tx.select({ id: users.id }).from(users).where(eq(users.id, input.actorUserId)).for("update").limit(1);

        const existingAllocations = await tx
          .select({ key: personalLocalTaskKeyAllocations.key })
          .from(personalLocalTaskKeyAllocations)
          .where(
            and(
              eq(personalLocalTaskKeyAllocations.userId, input.actorUserId),
              eq(personalLocalTaskKeyAllocations.localTaskId, input.localTaskId),
            ),
          )
          .limit(1);
        const existingAllocation = existingAllocations[0];
        if (existingAllocation) {
          return existingAllocation;
        }

        const counterRows = await tx
          .insert(personalLocalTaskKeyCounters)
          .values({ userId: input.actorUserId, lastAllocatedNumber: 1 })
          .onConflictDoUpdate({
            target: personalLocalTaskKeyCounters.userId,
            set: { lastAllocatedNumber: sql`${personalLocalTaskKeyCounters.lastAllocatedNumber} + 1` },
          })
          .returning({ lastAllocatedNumber: personalLocalTaskKeyCounters.lastAllocatedNumber });
        const sequenceNumber = counterRows[0]?.lastAllocatedNumber;
        if (sequenceNumber === undefined) {
          throw new LocalTaskKeyAllocationFailedError("personal");
        }

        const key = `PERS-${sequenceNumber}`;
        await tx.insert(personalLocalTaskKeyAllocations).values({
          userId: input.actorUserId,
          localTaskId: input.localTaskId,
          key,
          sequenceNumber,
        });
        return { key };
      });
    } catch (error) {
      if (error instanceof LocalTaskKeyAllocationFailedError) {
        throw error;
      }
      throw new LocalTaskKeyAllocationFailedError("personal", error);
    }
  }

  async getById(userId: string) {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        userPreferences: users.userPreferences,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Looks up a user by their unique email address.
   * Returns `null` when no matching user exists.
   */
  async getByEmail(email: string) {
    const rows = await this.db
      .select({ id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return rows[0] ?? null;
  }

  async resolveUserIdForOAuthProfile(profile: OAuthProfile): Promise<string> {
    return this.db.transaction(async (tx) => {
      let userId: string | null = null;

      const existingAccountRows = await tx
        .select({ userId: oauthAccounts.userId })
        .from(oauthAccounts)
        .where(
          and(eq(oauthAccounts.provider, profile.provider), eq(oauthAccounts.providerUserId, profile.providerUserId)),
        )
        .limit(1);

      if (existingAccountRows.length > 0) {
        userId = existingAccountRows[0]?.userId ?? null;
      }

      if (!userId) {
        const insertedUsers = await tx
          .insert(users)
          .values({
            id: newId(),
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
          })
          .onConflictDoNothing()
          .returning({ id: users.id });

        userId = insertedUsers[0]?.id ?? null;

        if (!userId) {
          const existingUserRows = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, profile.email))
            .limit(1);

          userId = existingUserRows[0]?.id ?? null;
        }
      }

      if (!userId) {
        throw new Error("Failed to resolve local user for OAuth profile");
      }

      await tx
        .insert(oauthAccounts)
        .values({
          id: newId(),
          userId,
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        })
        .onConflictDoNothing();

      const linkedAccountRows = await tx
        .select({ userId: oauthAccounts.userId })
        .from(oauthAccounts)
        .where(
          and(eq(oauthAccounts.provider, profile.provider), eq(oauthAccounts.providerUserId, profile.providerUserId)),
        )
        .limit(1);

      const linkedUserId = linkedAccountRows[0]?.userId;
      if (!linkedUserId) {
        throw new Error("Failed to link OAuth account");
      }

      await tx
        .update(users)
        .set({
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, linkedUserId));

      // Accept any pending invitations for this email — runs for both new and
      // returning users so an invite issued after first login is never missed.
      if (this.inviteService) {
        await this.inviteService.acceptPendingInvitesForEmail(tx, linkedUserId, profile.email);
      }

      return linkedUserId;
    });
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const rows = await this.db
      .select({ userPreferences: users.userPreferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return mergeUserPreferences(rows[0]?.userPreferences, {});
  }

  async updateUserPreferences(userId: string, patch: UserPreferencesPatch): Promise<UserPreferences> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ userPreferences: users.userPreferences })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const currentPreferences = mergeUserPreferences(rows[0]?.userPreferences, {});
      const mergedPreferences = mergeUserPreferences(currentPreferences, patch);

      await tx
        .update(users)
        .set({
          userPreferences: mergedPreferences,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      return mergedPreferences;
    });
  }

  async updateLanguagePreference(userId: string, languagePreference: string): Promise<string> {
    const preferences = await this.updateUserPreferences(userId, { languagePreference });
    return preferences.languagePreference;
  }

  async updateNotificationPreferences(userId: string, patch: NotificationPreferencesPatch) {
    const preferences = await this.updateUserPreferences(userId, { notificationPreferences: patch });
    return preferences.notificationPreferences;
  }
}
