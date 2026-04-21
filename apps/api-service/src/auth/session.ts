import { and, eq, gt } from "drizzle-orm";

import { sessions, users } from "../db/schema";
import { randomToken, sha256Hex } from "./security";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export async function createSession(
  db: any,
  userId: string,
  ttlDays: number
) {
  const token = randomToken(48);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    expiresAt
  });

  return {
    token,
    expiresAt
  };
}

export async function getSessionUser(db: any, token: string): Promise<SessionUser | null> {
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

export async function invalidateSession(db: any, token: string) {
  const tokenHash = await sha256Hex(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
