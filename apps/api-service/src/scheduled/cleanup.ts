import type { AppDb } from "@/db/client";
import type { ScheduledDbEnv } from "@/scheduled/db";
import { CleanupService } from "@/services/cleanup-service";

export type CleanupEnv = ScheduledDbEnv & {
  REVOKED_TOKEN_RETENTION_DAYS?: string;
};

export async function handleCleanup(db: AppDb, env: CleanupEnv): Promise<void> {
  try {
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
  }
}
