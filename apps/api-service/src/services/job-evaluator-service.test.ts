import type { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { AppDb } from "@/db/client";
import { scheduledJobRuns, scheduledJobs } from "@/db/schema";
import { JobEvaluatorService } from "@/services/job-evaluator-service";
import { describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-06-16T00:00:30.000Z");
const DUE_AT = new Date("2026-06-16T00:00:00.000Z");
const SQL_DIALECT = new PgDialect();

describe("JobEvaluatorService queue dispatch", () => {
  it("reads the run trigger from the pending run rather than the queue message", async () => {
    let selectedColumns: Record<string, unknown> | undefined;
    const db = {
      select: vi.fn((columns: Record<string, unknown>) => {
        selectedColumns = columns;
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{ runId: "run-1", trigger: "manual" }]),
            })),
          })),
        };
      }),
    } as unknown as AppDb;
    const service = new JobEvaluatorService(db);

    await expect(
      service.getPendingRunForDispatch({
        runId: "run-1",
        jobId: "job-1",
        nodeId: "node-1",
        scheduledFor: DUE_AT,
      }),
    ).resolves.toEqual({ runId: "run-1", trigger: "manual" });

    expect(selectedColumns).toEqual({ runId: scheduledJobRuns.id, trigger: scheduledJobRuns.trigger });
  });
});

describe("JobEvaluatorService.terminalizeStaleRuns", () => {
  it("records a stale running summary at the run start time", async () => {
    const staleRunStartedAt = new Date("2026-06-15T23:40:00.000Z");
    const updates: Array<{ table: unknown; values: Record<string, unknown>; condition: unknown }> = [];
    const db = {
      transaction: vi.fn(async (callback: (tx: AppDb) => Promise<void>) => callback(db as unknown as AppDb)),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn((condition: unknown) => {
            updates.push({ table, values, condition });
            const rows =
              updates.length === 1
                ? [{ id: "manual-pending-run" }]
                : updates.length === 2
                  ? [{ jobId: "job-1", startedAt: staleRunStartedAt, createdAt: DUE_AT }]
                  : [];
            return { returning: vi.fn(async () => rows) };
          }),
        })),
      })),
    } as unknown as AppDb;
    const service = new JobEvaluatorService(db);

    const result = await service.terminalizeStaleRuns({ staleThresholdMinutes: 10, now: NOW });

    expect(result).toEqual({ skippedOffline: 1, failed: 1 });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(updates.map((update) => update.table)).toEqual([scheduledJobRuns, scheduledJobRuns, scheduledJobs]);
    expect(updates[2]?.values).toEqual({
      lastRunAt: staleRunStartedAt,
      lastRunStatus: "failed",
      lastErrorCode: "DAEMON_INTERRUPTED",
      lastErrorMessage: "Daemon interrupted while the run was executing",
      updatedAt: NOW,
    });

    const pendingCondition = SQL_DIALECT.sqlToQuery(updates[0]?.condition as ReturnType<typeof sql>).sql;
    const runningCondition = SQL_DIALECT.sqlToQuery(updates[1]?.condition as ReturnType<typeof sql>).sql;
    const summaryQuery = SQL_DIALECT.sqlToQuery(updates[2]?.condition as ReturnType<typeof sql>);
    expect(pendingCondition).toContain('"scheduled_job_runs"."status" = $1');
    expect(pendingCondition).toContain('"scheduled_job_runs"."created_at" < $2');
    expect(pendingCondition).not.toContain('"scheduled_job_runs"."trigger"');
    expect(runningCondition).toContain('"scheduled_job_runs"."status" = $1');
    expect(runningCondition).toContain('"scheduled_job_runs"."started_at" is not null');
    expect(runningCondition).toContain('"scheduled_job_runs"."started_at" < $2');
    expect(summaryQuery.sql).toContain('"scheduled_jobs"."id" = $1');
    expect(summaryQuery.sql).toContain('"scheduled_jobs"."last_run_at" is null');
    expect(summaryQuery.sql).toContain('"scheduled_jobs"."last_run_at" <= $2');
    expect(summaryQuery.params).toEqual(["job-1", staleRunStartedAt.toISOString()]);
  });

  it("does not overwrite a newer completion that conflicts during cleanup", async () => {
    const staleRunStartedAt = new Date("2026-06-15T23:40:00.000Z");
    const newerCompletionAt = new Date("2026-06-16T00:00:00.000Z");
    const job = { lastRunAt: null as Date | null, lastRunStatus: null as string | null };
    const run = { status: "running" };
    const db = {
      transaction: vi.fn(async (callback: (tx: AppDb) => Promise<void>) => callback(db as unknown as AppDb)),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn((condition: unknown) => {
            if (table === scheduledJobRuns && values.status === "skipped_offline") {
              return { returning: vi.fn(async () => []) };
            }

            if (table === scheduledJobRuns && values.status === "failed") {
              run.status = "failed";
              // A newer run completes after cleanup has terminalized this stale run,
              // but before cleanup can conditionally update the parent summary.
              job.lastRunAt = newerCompletionAt;
              job.lastRunStatus = "succeeded";
              return {
                returning: vi.fn(async () => [{ jobId: "job-1", startedAt: staleRunStartedAt, createdAt: DUE_AT }]),
              };
            }

            const summaryQuery = SQL_DIALECT.sqlToQuery(condition as ReturnType<typeof sql>);
            const hasMonotonicGuard = summaryQuery.sql.includes('"scheduled_jobs"."last_run_at" <= $2');
            const runSummaryAt = summaryQuery.params[1];
            if (
              hasMonotonicGuard &&
              runSummaryAt === staleRunStartedAt.toISOString() &&
              job.lastRunAt !== null &&
              job.lastRunAt > staleRunStartedAt
            ) {
              return Promise.resolve();
            }

            job.lastRunAt = values.lastRunAt as Date;
            job.lastRunStatus = values.lastRunStatus as string;
            return Promise.resolve();
          }),
        })),
      })),
    } as unknown as AppDb;
    const service = new JobEvaluatorService(db);

    await service.terminalizeStaleRuns({ staleThresholdMinutes: 10, now: NOW });

    expect(run.status).toBe("failed");
    expect(job).toEqual({ lastRunAt: newerCompletionAt, lastRunStatus: "succeeded" });
  });
});
