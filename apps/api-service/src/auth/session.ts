import { and, eq, gt } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { newId } from "@/lib/id";
import { randomToken, sha256Hex } from "@/auth/security";

export type SessionUser = Pick<typeof users.$inferSelect, "id" | "email" | "name" | "avatarUrl">;

export async function createSession(
  db: AppDb,
  userId: string,
  ttlDays: number
) {
  const token = randomToken(48);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: newId(),
    userId,
    tokenHash,
    expiresAt
  });

  return {
    token,
    expiresAt
  };
}

export async function getSessionUser(db: AppDb, token: string): Promise<SessionUser | null> {
  const tokenHash = await sha256Hex(token);
  const now = new Date();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  return rows[0] ?? null;
}

export async function invalidateSession(db: AppDb, token: string) {
  const tokenHash = await sha256Hex(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
