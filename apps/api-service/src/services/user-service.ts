import { and, eq } from "drizzle-orm";

import type { AppDb } from "../db/client";
import { oauthAccounts, users } from "../db/schema";
import { newId } from "../lib/id";
import type { OAuthProfile } from "../types";

export class UserService {
  constructor(private readonly db: AppDb) {}

  async getById(userId: string) {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl
      })
      .from(users)
      .where(eq(users.id, userId))
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
          and(
            eq(oauthAccounts.provider, profile.provider),
            eq(oauthAccounts.providerUserId, profile.providerUserId)
          )
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
            avatarUrl: profile.avatarUrl
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
          providerUserId: profile.providerUserId
        })
        .onConflictDoNothing();

      const linkedAccountRows = await tx
        .select({ userId: oauthAccounts.userId })
        .from(oauthAccounts)
        .where(
          and(
            eq(oauthAccounts.provider, profile.provider),
            eq(oauthAccounts.providerUserId, profile.providerUserId)
          )
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
          updatedAt: new Date()
        })
        .where(eq(users.id, linkedUserId));

      return linkedUserId;
    });
  }
}
