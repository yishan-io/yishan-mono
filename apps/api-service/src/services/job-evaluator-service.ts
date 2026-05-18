import type { AgentKind } from "@yishan/core";
import { and, eq, lte } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { nodes, scheduledJobRuns, scheduledJobs } from "@/db/schema";
import {
  NodeNotFoundError,
  ScheduledJobInvalidCronError,
  ScheduledJobInvalidTimezoneError,
  WorkspaceLocalNodePermissionRequiredError,
  WorkspaceLocalNodeScopeInvalidError,
} from "@/errors";
import { newId } from "@/lib/id";
import { computeNextRunAt, ensureTimezoneSupported, parseCronExpression } from "@/scheduled/cron";
import type { PendingRun, ScheduledJobView } from "@/services/scheduled-job-service";

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

function toScheduledJobViewLocal(row: typeof scheduledJobs.$inferSelect): ScheduledJobView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    nodeId: row.nodeId,
    name: row.name,
    agentKind: row.agentKind as AgentKind,
    prompt: row.prompt,
    model: row.model,
    command: row.command,
    cronExpression: row.cronExpression,
    timezone: row.timezone,
    status: row.status,
    nextRunAt: row.nextRunAt,
    lastScheduledFor: row.lastScheduledFor,
    lastRunAt: row.lastRunAt,
    lastRunStatus: row.lastRunStatus,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
    const rows = await this.db
      .select({ id: nodes.id, ownerUserId: nodes.ownerUserId, scope: nodes.scope })
      .from(nodes)
      .where(eq(nodes.id, nodeId))
      .limit(1);

    const node = rows[0];
    if (!node) {
      throw new NodeNotFoundError(nodeId);
    }
    if (node.scope !== "private") {
      throw new WorkspaceLocalNodeScopeInvalidError(nodeId);
    }
    if (node.ownerUserId !== actorUserId) {
      throw new WorkspaceLocalNodePermissionRequiredError();
    }
  }

  /** Claims all due scheduled jobs and creates pending run records for them. */
  async evaluateDueJobs(input: { limit: number; now?: Date }): Promise<PendingRun[]> {
    const now = input.now ?? new Date();

    const dueJobs = await this.db
      .select()
      .from(scheduledJobs)
      .where(and(eq(scheduledJobs.status, "active"), lte(scheduledJobs.nextRunAt, now)))
      .limit(input.limit);

    const pending: PendingRun[] = [];

    for (const dueJob of dueJobs) {
      const parsed = validateCronOrThrow(dueJob.cronExpression);
      const timezone = validateTimezoneOrThrow(dueJob.timezone);
      const rawScheduledFor = dueJob.nextRunAt;
      const scheduledFor = bucketToMinute(rawScheduledFor);
      const nextRunAt = computeNextRunAt(parsed, timezone, rawScheduledFor);
      const runId = newId();

      // Optimistic lock: only advance if nextRunAt hasn't changed
      const updatedRows = await this.db
        .update(scheduledJobs)
        .set({ nextRunAt, lastScheduledFor: scheduledFor, updatedAt: now })
        .where(
          and(
            eq(scheduledJobs.id, dueJob.id),
            eq(scheduledJobs.status, "active"),
            eq(scheduledJobs.nextRunAt, rawScheduledFor),
          ),
        )
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        continue;
      }

      // Conflict guard: unique index on (job_id, scheduled_for) prevents duplicate runs
      const insertedRows = await this.db
        .insert(scheduledJobRuns)
        .values({
          id: runId,
          jobId: updated.id,
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          nodeId: updated.nodeId,
          scheduledFor,
          status: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: scheduledJobRuns.id });

      if (insertedRows.length === 0) {
        continue;
      }

      pending.push({
        runId,
        scheduledFor,
        job: toScheduledJobViewLocal(updated),
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
      .select()
      .from(scheduledJobRuns)
      .where(and(eq(scheduledJobRuns.id, input.runId), eq(scheduledJobRuns.nodeId, input.nodeId)))
      .limit(1);

    const run = runRows[0];
    if (!run) {
      console.warn(`[JobEvaluatorService.completeRun] Run not found: runId=${input.runId}`);
      return;
    }

    const finishedAt = input.finishedAt ?? new Date();
    await this.db
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

    await this.db
      .update(scheduledJobs)
      .set({
        lastRunAt: finishedAt,
        lastRunStatus: input.status,
        lastErrorCode: input.status === "failed" ? (input.errorCode ?? null) : null,
        lastErrorMessage: input.status === "failed" ? (input.errorMessage ?? null) : null,
        updatedAt: finishedAt,
      })
      .where(eq(scheduledJobs.id, run.jobId));
  }
}
