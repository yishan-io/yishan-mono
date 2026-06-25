import { and, desc, eq, lte } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { scheduledJobRuns, scheduledJobs, workspaces } from "@/db/schema";
import { ScheduledJobInvalidCronError, ScheduledJobInvalidTimezoneError } from "@/errors";
import { newId } from "@/lib/id";
import { computeNextRunAt, ensureTimezoneSupported, parseCronExpression } from "@/scheduled/cron";
import type { PendingRun, ScheduledJobView } from "@/services/scheduled-job-service";
import { toScheduledJobView } from "@/services/scheduled-job-service";
import { assertNodeOwnedByActor } from "@/services/shared/assertNodeOwnedByActor";

const MAX_RESPONSE_BODY_SIZE = 4096;

function bucketToMinute(date: Date): Date {
  const rounded = new Date(date.getTime());
  rounded.setUTCSeconds(0, 0);
  return rounded;
}

function limitResponseBody(raw: string): string {
  if (raw.length <= MAX_RESPONSE_BODY_SIZE) {
    return raw;
  }
  return `${raw.slice(0, MAX_RESPONSE_BODY_SIZE)}...`;
}

function validateCronOrThrow(expression: string) {
  try {
    return parseCronExpression(expression);
  } catch (error) {
    throw new ScheduledJobInvalidCronError(
      expression,
      error instanceof Error ? error.message : "Unknown cron parse error",
    );
  }
}

function validateTimezoneOrThrow(timezone: string): string {
  try {
    return ensureTimezoneSupported(timezone);
  } catch (error) {
    throw new ScheduledJobInvalidTimezoneError(
      timezone,
      error instanceof Error ? error.message : "Unknown timezone validation error",
    );
  }
}

/**
 * Handles background job evaluation: claiming due jobs, marking stale runs,
 * and recording run lifecycle events.
 *
 * This service operates independently of the HTTP request cycle and is called
 * only from the scheduled evaluator worker.
 */
export class JobEvaluatorService {
  constructor(private readonly db: AppDb) {}

  private async assertNodeOwnedByActor(nodeId: string, actorUserId: string): Promise<void> {
    await assertNodeOwnedByActor(this.db, nodeId, actorUserId);
  }

  /** Claims all due scheduled jobs and creates pending run records for them. */
  async evaluateDueJobs(input: { limit: number; now?: Date }): Promise<PendingRun[]> {
    const now = input.now ?? new Date();

    const dueJobs = await this.db
      .select()
      .from(scheduledJobs)
      .where(and(eq(scheduledJobs.status, "active"), lte(scheduledJobs.nextRunAt, now)))
      .limit(input.limit);

    if (dueJobs.length === 0) {
      return [];
    }

    // Pre-compute per-job values before hitting the DB.
    const jobWork = dueJobs.map((dueJob) => {
      const parsed = validateCronOrThrow(dueJob.cronExpression);
      const timezone = validateTimezoneOrThrow(dueJob.timezone);
      const rawScheduledFor = dueJob.nextRunAt;
      const scheduledFor = bucketToMinute(rawScheduledFor);
      const nextRunAt = computeNextRunAt(parsed, timezone, rawScheduledFor);
      const runId = newId();
      return { dueJob, parsed, timezone, rawScheduledFor, scheduledFor, nextRunAt, runId };
    });

    // Optimistic-lock UPDATEs fired concurrently — one round-trip instead of N.
    const updateResults = await Promise.all(
      jobWork.map(({ dueJob, scheduledFor, nextRunAt }) =>
        this.db
          .update(scheduledJobs)
          .set({ nextRunAt, lastScheduledFor: scheduledFor, updatedAt: now })
          .where(
            and(
              eq(scheduledJobs.id, dueJob.id),
              eq(scheduledJobs.status, "active"),
              eq(scheduledJobs.nextRunAt, dueJob.nextRunAt),
            ),
          )
          .returning(),
      ),
    );

    // Collect claimed jobs; log optimistic-lock misses for diagnosability.
    const claimedWork = jobWork.flatMap((work, i) => {
      const updated = updateResults[i]?.[0];
      if (!updated) {
        console.debug(
          `[JobEvaluatorService.evaluateDueJobs] Optimistic lock miss — job already claimed or paused: jobId=${work.dueJob.id}`,
        );
        return [];
      }

      return [{ work, updated }] as const;
    });

    if (claimedWork.length === 0) {
      return [];
    }

    // Conflict guard: unique index on (job_id, scheduled_for) prevents duplicate runs.
    // Run INSERT concurrently for all claimed jobs — one round-trip instead of N.
    const insertResults = await Promise.all(
      claimedWork.map(({ work, updated }) => {
        return this.db
          .insert(scheduledJobRuns)
          .values({
            id: work.runId,
            jobId: updated.id,
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            nodeId: updated.nodeId,
            scheduledFor: work.scheduledFor,
            status: "pending",
          })
          .onConflictDoNothing()
          .returning({ id: scheduledJobRuns.id });
      }),
    );

    const pending: PendingRun[] = [];

    for (let i = 0; i < claimedWork.length; i++) {
      const claimed = claimedWork[i];
      const insertedRuns = insertResults[i];
      if (!claimed || !insertedRuns || insertedRuns.length === 0) {
        continue;
      }

      pending.push({
        runId: claimed.work.runId,
        scheduledFor: claimed.work.scheduledFor,
        job: toScheduledJobView(claimed.updated),
      });
    }

    return pending;
  }

  /** Marks pending runs that have not started within the stale threshold as skipped_offline. */
  async markStaleRunsOffline(input: { staleThresholdMinutes: number; now?: Date }): Promise<number> {
    const now = input.now ?? new Date();
    const threshold = new Date(now.getTime() - input.staleThresholdMinutes * 60_000);

    const rows = await this.db
      .update(scheduledJobRuns)
      .set({ status: "skipped_offline", finishedAt: now })
      .where(and(eq(scheduledJobRuns.status, "pending"), lte(scheduledJobRuns.createdAt, threshold)))
      .returning({ id: scheduledJobRuns.id });

    return rows.length;
  }

  async getPendingRunForDispatch(input: {
    runId: string;
    jobId: string;
    nodeId: string;
    scheduledFor: Date;
  }): Promise<{ runId: string } | null> {
    const rows = await this.db
      .select({ runId: scheduledJobRuns.id })
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

  /** Records that a node has started executing a scheduled run. */
  async markRunStarted(input: {
    runId: string;
    nodeId: string;
    actorUserId: string;
    startedAt?: Date;
  }): Promise<void> {
    await this.assertNodeOwnedByActor(input.nodeId, input.actorUserId);
    await this.db
      .update(scheduledJobRuns)
      .set({ status: "running", startedAt: input.startedAt ?? new Date() })
      .where(and(eq(scheduledJobRuns.id, input.runId), eq(scheduledJobRuns.nodeId, input.nodeId)));
  }

  /** Records the final outcome of a scheduled run and updates the parent job's last-run summary. */
  async completeRun(input: {
    runId: string;
    nodeId: string;
    actorUserId: string;
    status: "succeeded" | "failed";
    finishedAt?: Date;
    responseBody?: string;
    errorCode?: string;
    errorMessage?: string;
    errorDetails?: Record<string, unknown>;
  }): Promise<void> {
    await this.assertNodeOwnedByActor(input.nodeId, input.actorUserId);

    const runRows = await this.db
      .select({ id: scheduledJobRuns.id, jobId: scheduledJobRuns.jobId })
      .from(scheduledJobRuns)
      .where(and(eq(scheduledJobRuns.id, input.runId), eq(scheduledJobRuns.nodeId, input.nodeId)))
      .limit(1);

    const run = runRows[0];
    if (!run) {
      console.warn(`[JobEvaluatorService.completeRun] Run not found: runId=${input.runId}`);
      return;
    }

    const finishedAt = input.finishedAt ?? new Date();

    // Both UPDATEs must succeed together — wrap in a transaction so a mid-flight
    // crash cannot leave the run status and job last-run summary out of sync.
    await this.db.transaction(async (tx) => {
      await tx
        .update(scheduledJobRuns)
        .set({
          status: input.status,
          finishedAt,
          responseBody: input.responseBody ? limitResponseBody(input.responseBody) : null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          errorDetails: input.errorDetails ?? null,
        })
        .where(eq(scheduledJobRuns.id, run.id));

      await tx
        .update(scheduledJobs)
        .set({
          lastRunAt: finishedAt,
          lastRunStatus: input.status,
          lastErrorCode: input.status === "failed" ? (input.errorCode ?? null) : null,
          lastErrorMessage: input.status === "failed" ? (input.errorMessage ?? null) : null,
          updatedAt: finishedAt,
        })
        .where(eq(scheduledJobs.id, run.jobId));
    });
  }
}
