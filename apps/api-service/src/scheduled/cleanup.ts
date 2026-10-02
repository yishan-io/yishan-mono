import type { AppDb } from "@/db/client";
import type { ScheduledDbEnv } from "@/scheduled/db";
import { CleanupService } from "@/services/cleanup-service";
import { JobEvaluatorService } from "@/services/job-evaluator-service";

const STALE_RUN_THRESHOLD_MINUTES = 10;

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
    const staleRuns = await new JobEvaluatorService(db).terminalizeStaleRuns({
      staleThresholdMinutes: STALE_RUN_THRESHOLD_MINUTES,
    });

    console.log(
      `[cleanup] Completed — deleted ${result.deletedSessions} expired sessions, ` +
        `${result.deletedExpiredRefreshTokens} expired refresh tokens, ` +
        `${result.deletedRevokedRefreshTokens} old revoked refresh tokens, ` +
        `${staleRuns.skippedOffline} stale pending runs, ${staleRuns.failed} stale running runs`,
    );
  } catch (error) {
    console.error("[cleanup] Failed:", error);
    throw error;
  }
}
