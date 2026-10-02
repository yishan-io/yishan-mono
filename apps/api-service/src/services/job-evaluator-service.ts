import { and, desc, eq, isNotNull, isNull, lt, lte, or } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { scheduledJobRuns, scheduledJobs, workspaces } from "@/db/schema";

/**
 * Provides daily stale-run cleanup and manual Queue dispatch support.
 */
export class JobEvaluatorService {
  constructor(private readonly db: AppDb) {}

  /**
   * Terminalizes abandoned daemon-owned runs and records a summary only for stale running runs.
   *
   * Run-status predicates and the monotonic parent-summary predicate are compare-and-swap guards.
   * This prevents cleanup from replacing a concurrent daemon completion or regressing a newer summary.
   */
  async terminalizeStaleRuns(input: { staleThresholdMinutes: number; now?: Date }): Promise<{
    skippedOffline: number;
    failed: number;
  }> {
    const now = input.now ?? new Date();
    const threshold = new Date(now.getTime() - input.staleThresholdMinutes * 60_000);

    return this.db.transaction(async (tx) => {
      const skippedOfflineRuns = await tx
        .update(scheduledJobRuns)
        .set({
          status: "skipped_offline",
          finishedAt: now,
          errorCode: "DAEMON_INTERRUPTED",
          errorMessage: "Daemon interrupted before the run started",
        })
        .where(and(eq(scheduledJobRuns.status, "pending"), lt(scheduledJobRuns.createdAt, threshold)))
        .returning({ id: scheduledJobRuns.id });
      const failedRuns = await tx
        .update(scheduledJobRuns)
        .set({
          status: "failed",
          finishedAt: now,
          errorCode: "DAEMON_INTERRUPTED",
          errorMessage: "Daemon interrupted while the run was executing",
        })
        .where(
          and(
            eq(scheduledJobRuns.status, "running"),
            isNotNull(scheduledJobRuns.startedAt),
            lt(scheduledJobRuns.startedAt, threshold),
          ),
        )
        .returning({
          jobId: scheduledJobRuns.jobId,
          startedAt: scheduledJobRuns.startedAt,
          createdAt: scheduledJobRuns.createdAt,
        });

      for (const failedRun of failedRuns) {
        const runSummaryAt = failedRun.startedAt ?? failedRun.createdAt;
        await tx
          .update(scheduledJobs)
          .set({
            lastRunAt: runSummaryAt,
            lastRunStatus: "failed",
            lastErrorCode: "DAEMON_INTERRUPTED",
            lastErrorMessage: "Daemon interrupted while the run was executing",
            updatedAt: now,
          })
          .where(
            and(
              eq(scheduledJobs.id, failedRun.jobId),
              or(isNull(scheduledJobs.lastRunAt), lte(scheduledJobs.lastRunAt, runSummaryAt)),
            ),
          );
      }

      return { skippedOffline: skippedOfflineRuns.length, failed: failedRuns.length };
    });
  }

  /** Gets a pending run and its authoritative trigger for the Queue consumer. */
  async getPendingRunForDispatch(input: {
    runId: string;
    jobId: string;
    nodeId: string;
    scheduledFor: Date;
  }): Promise<{ runId: string; trigger: "manual" | "schedule" } | null> {
    const rows = await this.db
      .select({ runId: scheduledJobRuns.id, trigger: scheduledJobRuns.trigger })
      .from(scheduledJobRuns)
      .where(
        and(
          eq(scheduledJobRuns.id, input.runId),
          eq(scheduledJobRuns.jobId, input.jobId),
          eq(scheduledJobRuns.nodeId, input.nodeId),
          eq(scheduledJobRuns.status, "pending"),
          eq(scheduledJobRuns.scheduledFor, input.scheduledFor),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async markRunSkippedOffline(input: { runId: string; nodeId: string; reason?: string }): Promise<void> {
    await this.db
      .update(scheduledJobRuns)
      .set({
        status: "skipped_offline",
        finishedAt: new Date(),
        errorCode: "NODE_OFFLINE",
        errorMessage: input.reason ?? "node offline",
      })
      .where(
        and(
          eq(scheduledJobRuns.id, input.runId),
          eq(scheduledJobRuns.nodeId, input.nodeId),
          eq(scheduledJobRuns.status, "pending"),
        ),
      );
  }

  async findProjectPathForNode(input: { projectId: string; nodeId: string }): Promise<string | null> {
    const rows = await this.db
      .select({ localPath: workspaces.localPath })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.projectId, input.projectId),
          eq(workspaces.nodeId, input.nodeId),
          eq(workspaces.kind, "primary"),
          eq(workspaces.status, "active"),
        ),
      )
      .orderBy(desc(workspaces.updatedAt))
      .limit(1);

    return rows[0]?.localPath ?? null;
  }
}
