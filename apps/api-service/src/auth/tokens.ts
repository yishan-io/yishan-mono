import { and, eq, gt, isNull } from "drizzle-orm";

import type { AppDb } from "../db/client";
import { refreshTokens } from "../db/schema";
import { newId } from "../lib/id";
import type { ServiceConfig } from "../types";
import { randomToken, sha256Hex, signAccessToken } from "./security";

export type TokenPair = {
  accessToken: string;
  accessTokenExpiresIn: number;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

async function createRefreshTokenRecord(db: AppDb, userId: string, ttlDays: number) {
  const token = randomToken(48);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const id = newId();

  await db.insert(refreshTokens).values({
    id,
    userId,
    tokenHash,
    expiresAt
  });

  return {
    id,
    token,
    expiresAt
  };
}

export async function issueTokenPair(db: AppDb, userId: string, config: ServiceConfig): Promise<TokenPair> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const accessExp = nowSeconds + config.jwtAccessTtlSeconds;
  const refresh = await createRefreshTokenRecord(db, userId, config.refreshTokenTtlDays);

  const accessToken = await signAccessToken(
    {
      sub: userId,
      sid: refresh.id,
      scope: "api:read api:write",
      iss: config.jwtIssuer,
      aud: config.jwtAudience,
      iat: nowSeconds,
      exp: accessExp
    },
    config.jwtAccessSecret
  );

  return {
    accessToken,
    accessTokenExpiresIn: config.jwtAccessTtlSeconds,
    accessTokenExpiresAt: new Date(accessExp * 1000).toISOString(),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt.toISOString()
  };
}

export async function rotateRefreshToken(
  db: AppDb,
  refreshToken: string,
  config: ServiceConfig
): Promise<{
  userId: string;
  refreshTokenId: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
} | null> {
  const refreshTokenHash = await sha256Hex(refreshToken);
  const now = new Date();

  const rows = await db
    .select({
      id: refreshTokens.id,
      userId: refreshTokens.userId
    })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, refreshTokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const replacement = await createRefreshTokenRecord(db, row.userId, config.refreshTokenTtlDays);

  await db
    .update(refreshTokens)
    .set({
      revokedAt: now,
      replacedByTokenId: replacement.id
    })
    .where(eq(refreshTokens.id, row.id));

  return {
    userId: row.userId,
    refreshTokenId: replacement.id,
    refreshToken: replacement.token,
    refreshTokenExpiresAt: replacement.expiresAt.toISOString()
  };
}

export async function revokeRefreshToken(db: AppDb, refreshToken: string): Promise<boolean> {
  const refreshTokenHash = await sha256Hex(refreshToken);
  const rows = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, refreshTokenHash), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  return rows.length > 0;
}
