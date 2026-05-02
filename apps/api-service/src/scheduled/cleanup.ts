import { createRequestDb, getDb } from "@/db/client";
import { CleanupService } from "@/services/cleanup-service";

type ScheduledEnv = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  REVOKED_TOKEN_RETENTION_DAYS?: string;
};

export async function handleCleanup(env: ScheduledEnv): Promise<void> {
  const databaseUrl = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[cleanup] No database connection available — skipping cleanup");
    return;
  }

  const hasHyperdrive = Boolean(env.HYPERDRIVE);
  let requestDb: Awaited<ReturnType<typeof createRequestDb>> | null = null;

  try {
    requestDb = hasHyperdrive ? await createRequestDb(databaseUrl) : null;
    const db = requestDb?.db ?? getDb(databaseUrl);

    const retentionDaysRaw = env.REVOKED_TOKEN_RETENTION_DAYS;
    const retentionDays =
      retentionDaysRaw && Number.isFinite(Number(retentionDaysRaw)) && Number(retentionDaysRaw) > 0
        ? Number(retentionDaysRaw)
        : undefined;

    const cleanup = new CleanupService(db, retentionDays);
    const result = await cleanup.runAll();

    console.log(
      `[cleanup] Completed — deleted ${result.deletedSessions} expired sessions, ` +
        `${result.deletedExpiredRefreshTokens} expired refresh tokens, ` +
        `${result.deletedRevokedRefreshTokens} old revoked refresh tokens`,
    );
  } catch (error) {
    console.error("[cleanup] Failed:", error);
    throw error;
  } finally {
    await requestDb?.close();
  }
}
