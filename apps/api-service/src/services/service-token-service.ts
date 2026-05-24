import { and, eq, gt, isNull, desc } from "drizzle-orm";

import { randomToken, sha256Hex } from "@/auth/security";
import type { AppDb } from "@/db/client";
import { serviceTokens, users } from "@/db/schema";
import { ServiceTokenNotFoundError } from "@/errors";
import { newId } from "@/lib/id";
import type { SessionUser } from "@/services/auth-service";

const SERVICE_TOKEN_PREFIX = "yst_";
const TOKEN_PREFIX_LENGTH = 8;

export class ServiceTokenService {
  constructor(private readonly db: AppDb) {}

  async create(input: {
    actorUserId: string;
    name: string;
    expiresAt?: Date;
  }): Promise<{ id: string; token: string; tokenPrefix: string; name: string; expiresAt: Date | null; createdAt: Date }> {
    const raw = randomToken(32);
    const token = SERVICE_TOKEN_PREFIX + raw;
    const tokenHash = await sha256Hex(token);
    const tokenPrefix = token.slice(0, SERVICE_TOKEN_PREFIX.length + TOKEN_PREFIX_LENGTH);
    const id = newId();
    const now = new Date();

    await this.db.insert(serviceTokens).values({
      id,
      name: input.name,
      userId: input.actorUserId,
      tokenPrefix,
      tokenHash,
      expiresAt: input.expiresAt ?? null,
    });

    return {
      id,
      token,
      tokenPrefix,
      name: input.name,
      expiresAt: input.expiresAt ?? null,
      createdAt: now,
    };
  }

  async list(actorUserId: string): Promise<
    Array<{
      id: string;
      name: string;
      tokenPrefix: string;
      scopes: string;
      lastUsedAt: Date | null;
      expiresAt: Date | null;
      revokedAt: Date | null;
      createdAt: Date;
    }>
  > {
    return this.db
      .select({
        id: serviceTokens.id,
        name: serviceTokens.name,
        tokenPrefix: serviceTokens.tokenPrefix,
        scopes: serviceTokens.scopes,
        lastUsedAt: serviceTokens.lastUsedAt,
        expiresAt: serviceTokens.expiresAt,
        revokedAt: serviceTokens.revokedAt,
        createdAt: serviceTokens.createdAt,
      })
      .from(serviceTokens)
      .where(eq(serviceTokens.userId, actorUserId))
      .orderBy(desc(serviceTokens.createdAt));
  }

  async revoke(actorUserId: string, tokenId: string): Promise<void> {
    const rows = await this.db
      .select({ id: serviceTokens.id })
      .from(serviceTokens)
      .where(
        and(
          eq(serviceTokens.id, tokenId),
          eq(serviceTokens.userId, actorUserId),
          isNull(serviceTokens.revokedAt),
        ),
      )
      .limit(1);

    if (!rows[0]) {
      throw new ServiceTokenNotFoundError(tokenId);
    }

    await this.db
      .update(serviceTokens)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(serviceTokens.id, tokenId));
  }

  async verify(token: string): Promise<SessionUser | null> {
    if (!token.startsWith(SERVICE_TOKEN_PREFIX)) {
      return null;
    }

    const tokenHash = await sha256Hex(token);
    const now = new Date();

    const rows = await this.db
      .select({
        tokenId: serviceTokens.id,
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        userPreferences: users.userPreferences,
      })
      .from(serviceTokens)
      .innerJoin(users, eq(users.id, serviceTokens.userId))
      .where(
        and(
          eq(serviceTokens.tokenHash, tokenHash),
          isNull(serviceTokens.revokedAt),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    // Check expiry after finding the token (so we can still update lastUsedAt tracking)
    // but before returning the user
    const tokenRecord = await this.db
      .select({ expiresAt: serviceTokens.expiresAt })
      .from(serviceTokens)
      .where(eq(serviceTokens.id, row.tokenId))
      .limit(1);

    if (tokenRecord[0]?.expiresAt && tokenRecord[0].expiresAt <= now) {
      return null;
    }

    // Update lastUsedAt (fire-and-forget, don't block the request)
    this.db
      .update(serviceTokens)
      .set({ lastUsedAt: now })
      .where(eq(serviceTokens.id, row.tokenId))
      .then(() => {})
      .catch(() => {});

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatarUrl,
      userPreferences: row.userPreferences,
    };
  }
}
