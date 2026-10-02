import type { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { nodes, scheduledJobRuns, scheduledJobs } from "@/db/schema";
import { AppError, OrganizationMembershipRequiredError, ScheduledJobRunTransitionUnavailableError } from "@/errors";
import { NodeScheduledJobRunService } from "@/services/node-scheduled-job-run-service";
import { describe, expect, it, vi } from "vitest";

const ACTOR_USER_ID = "user-1";
const NODE_ID = "node-1";
const RUN_ID = "run-1";
const STARTED_AT = new Date("2026-06-16T00:00:00.000Z");
const SQL_DIALECT = new PgDialect();

type RunState = {
  trigger: "manual" | "schedule";
  status: "pending" | "running" | "succeeded" | "failed" | "skipped_offline";
  startedAt: Date | null;
  organizationId: string;
  jobId: string;
  nodeId: string;
  finishedAt: Date | null;
  responseBody: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
};

type ParentSummary = {
  lastRunAt: Date | null;
  lastRunStatus: "succeeded" | "failed" | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

type LifecycleState = {
  run: RunState;
  parentSummary: ParentSummary;
  isJobActive: boolean;
  isJobAssignedToNode: boolean;
  isNodeOwned: boolean;
  isOrganizationMember: boolean;
  parentSummaryUpdateCount: number;
  staleRun: RunState | null;
  staleRunReadCount: number;
  shouldRevokeNodeOwnershipAfterCasMiss: boolean;
  shouldRevokeOrganizationMembershipAfterCasMiss: boolean;
};

function getSql(query: unknown): string {
  return SQL_DIALECT.sqlToQuery(query as ReturnType<typeof sql>).sql;
}

function createLifecycleDb(state: LifecycleState) {
  const createDb = (isTransaction: boolean) => ({
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            if (table === nodes) {
              return state.isNodeOwned ? [{ id: NODE_ID, scope: "private", ownerUserId: ACTOR_USER_ID }] : [];
            }
            if (table === scheduledJobRuns) {
              const run = state.staleRunReadCount > 0 && state.staleRun ? state.staleRun : state.run;
              state.staleRunReadCount -= 1;
              return [{ id: RUN_ID, ...run }];
            }
            return [];
          }),
        })),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Partial<RunState> & Partial<ParentSummary>) => ({
        where: vi.fn((condition: unknown) => {
          if (table === scheduledJobs) {
            const conditionSql = getSql(condition);
            const hasMonotonicLastRunGuard = conditionSql.includes('"scheduled_jobs"."last_run_at" is null');
            const incomingLastRunAt = values.lastRunAt;
            const currentLastRunAt = state.parentSummary.lastRunAt;
            const canUpdateSummary =
              !hasMonotonicLastRunGuard ||
              currentLastRunAt === null ||
              (incomingLastRunAt instanceof Date && incomingLastRunAt >= currentLastRunAt);
            if (canUpdateSummary) {
              state.parentSummary = { ...state.parentSummary, ...values };
              state.parentSummaryUpdateCount += 1;
            }
          }
          return {
            returning: vi.fn(async () => {
              const querySql = getSql(condition);
              const hasPendingGuard = querySql.includes('"scheduled_job_runs"."status" = $');
              const hasActiveJobGuard = (querySql.match(/exists/g) ?? []).length === 3;
              const isAuthorized = state.isNodeOwned && state.isOrganizationMember;
              const canStart =
                values.status === "running" &&
                state.run.status === "pending" &&
                hasPendingGuard &&
                (state.run.trigger === "manual" ||
                  (hasActiveJobGuard && state.isJobActive && state.isJobAssignedToNode));
              const canComplete =
                (values.status === "succeeded" || values.status === "failed") &&
                (state.run.status === "pending" || state.run.status === "running");
              if (table === scheduledJobRuns && isAuthorized && (canStart || canComplete)) {
                state.run = { ...state.run, ...values };
                return [{ id: RUN_ID, jobId: state.run.jobId }];
              }
              const isTerminalStatus = state.run.status === "succeeded" || state.run.status === "failed";
              const isConditionalWriteMiss =
                table === scheduledJobRuns &&
                isAuthorized &&
                ((values.status === "running" && state.run.status === "running") ||
                  ((values.status === "succeeded" || values.status === "failed") && isTerminalStatus));
              if (isConditionalWriteMiss && state.shouldRevokeNodeOwnershipAfterCasMiss) {
                state.isNodeOwned = false;
              }
              if (isConditionalWriteMiss && state.shouldRevokeOrganizationMembershipAfterCasMiss) {
                state.isOrganizationMember = false;
              }
              return [];
            }),
          };
        }),
      })),
    })),
    transaction: isTransaction
      ? undefined
      : vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(createDb(true))),
  });

  // biome-ignore lint/suspicious/noExplicitAny: focused stateful Drizzle double
  return createDb(false) as any;
}

function createService(overrides: Partial<LifecycleState> = {}) {
  const state: LifecycleState = {
    run: {
      trigger: "schedule",
      status: "pending",
      startedAt: null,
      organizationId: "org-1",
      jobId: "job-1",
      nodeId: NODE_ID,
      finishedAt: null,
      responseBody: null,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
    },
    isJobActive: true,
    isJobAssignedToNode: true,
    isNodeOwned: true,
    isOrganizationMember: true,
    parentSummary: {
      lastRunAt: null,
      lastRunStatus: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    parentSummaryUpdateCount: 0,
    staleRun: null,
    staleRunReadCount: 0,
    shouldRevokeNodeOwnershipAfterCasMiss: false,
    shouldRevokeOrganizationMembershipAfterCasMiss: false,
    ...overrides,
  };
  const organizationService = {
    getMembershipRole: vi.fn(async () => (state.isOrganizationMember ? "member" : null)),
    // biome-ignore lint/suspicious/noExplicitAny: focused OrganizationService double
  } as any;
  return { service: new NodeScheduledJobRunService(createLifecycleDb(state), organizationService), state };
}

describe("NodeScheduledJobRunService.markRunStarted", () => {
  it.each([
    ["the job is paused", { isJobActive: false }],
    ["the job is reassigned", { isJobAssignedToNode: false }],
    ["node ownership is revoked", { isNodeOwned: false }],
    ["organization membership is revoked", { isOrganizationMember: false }],
  ])("rejects a recurring run when %s", async (_scenario, overrides) => {
    const { service } = createService(overrides);

    await expect(
      service.markRunStarted({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        runId: RUN_ID,
        startedAt: STARTED_AT,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("reports started when it wins the pending-to-running transition", async () => {
    const { service, state } = createService({
      run: {
        trigger: "manual",
        status: "pending",
        startedAt: null,
        organizationId: "org-1",
        jobId: "job-1",
        nodeId: NODE_ID,
        finishedAt: null,
        responseBody: null,
        errorCode: null,
        errorMessage: null,
        errorDetails: null,
      },
    });

    await expect(
      service.markRunStarted({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        runId: RUN_ID,
        startedAt: STARTED_AT,
      }),
    ).resolves.toBe(true);

    expect(state.run).toMatchObject({ status: "running", startedAt: STARTED_AT });
  });

  it("accepts a concurrent start CAS loser after rereading the running run", async () => {
    const pendingRun: RunState = {
      trigger: "manual",
      status: "pending",
      startedAt: null,
      organizationId: "org-1",
      jobId: "job-1",
      nodeId: NODE_ID,
      finishedAt: null,
      responseBody: null,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
    };
    const { service, state } = createService({ run: pendingRun, staleRun: pendingRun, staleRunReadCount: 2 });

    await expect(
      Promise.all([
        service.markRunStarted({
          actorUserId: ACTOR_USER_ID,
          nodeId: NODE_ID,
          runId: RUN_ID,
          startedAt: STARTED_AT,
        }),
        service.markRunStarted({
          actorUserId: ACTOR_USER_ID,
          nodeId: NODE_ID,
          runId: RUN_ID,
          startedAt: STARTED_AT,
        }),
      ]),
    ).resolves.toEqual([true, false]);

    expect(state.run).toMatchObject({ status: "running", startedAt: STARTED_AT });
  });

  it("denies a start CAS loser when node ownership is revoked before its reread", async () => {
    const pendingRun: RunState = {
      trigger: "manual",
      status: "pending",
      startedAt: null,
      organizationId: "org-1",
      jobId: "job-1",
      nodeId: NODE_ID,
      finishedAt: null,
      responseBody: null,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
    };
    const { service, state } = createService({
      run: pendingRun,
      staleRun: pendingRun,
      staleRunReadCount: 2,
      shouldRevokeNodeOwnershipAfterCasMiss: true,
    });
    const start = {
      actorUserId: ACTOR_USER_ID,
      nodeId: NODE_ID,
      runId: RUN_ID,
      startedAt: STARTED_AT,
    };

    await expect(Promise.all([service.markRunStarted(start), service.markRunStarted(start)])).rejects.toBeInstanceOf(
      AppError,
    );

    expect(state.run).toMatchObject({ status: "running", startedAt: STARTED_AT });
  });

  it("denies a start CAS loser when organization membership is revoked before its reread", async () => {
    const pendingRun: RunState = {
      trigger: "manual",
      status: "pending",
      startedAt: null,
      organizationId: "org-1",
      jobId: "job-1",
      nodeId: NODE_ID,
      finishedAt: null,
      responseBody: null,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
    };
    const { service, state } = createService({
      run: pendingRun,
      staleRun: pendingRun,
      staleRunReadCount: 2,
      shouldRevokeOrganizationMembershipAfterCasMiss: true,
    });
    const start = {
      actorUserId: ACTOR_USER_ID,
      nodeId: NODE_ID,
      runId: RUN_ID,
      startedAt: STARTED_AT,
    };

    await expect(Promise.all([service.markRunStarted(start), service.markRunStarted(start)])).rejects.toBeInstanceOf(
      OrganizationMembershipRequiredError,
    );

    expect(state.run).toMatchObject({ status: "running", startedAt: STARTED_AT });
  });

  it("starts a manual run while its parent is paused and accepts duplicate acknowledgements", async () => {
    const { service, state } = createService({
      run: {
        trigger: "manual",
        status: "pending",
        startedAt: null,
        organizationId: "org-1",
        jobId: "job-1",
        nodeId: NODE_ID,
        finishedAt: null,
        responseBody: null,
        errorCode: null,
        errorMessage: null,
        errorDetails: null,
      },
      isJobActive: false,
    });

    await expect(
      service.markRunStarted({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        runId: RUN_ID,
        startedAt: STARTED_AT,
      }),
    ).resolves.toBe(true);
    await expect(
      service.markRunStarted({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        runId: RUN_ID,
        startedAt: new Date("2026-06-16T00:01:00.000Z"),
      }),
    ).resolves.toBe(false);

    expect(state.run).toMatchObject({ status: "running", startedAt: STARTED_AT });
  });
});

describe("NodeScheduledJobRunService.completeRun", () => {
  it("commits a terminal result and its parent summary once when relay result delivery is duplicated", async () => {
    const { service, state } = createService({
      run: {
        trigger: "schedule",
        status: "running",
        startedAt: STARTED_AT,
        organizationId: "org-1",
        jobId: "job-1",
        nodeId: NODE_ID,
        finishedAt: null,
        responseBody: null,
        errorCode: null,
        errorMessage: null,
        errorDetails: null,
      },
    });
    const completion = {
      actorUserId: ACTOR_USER_ID,
      nodeId: NODE_ID,
      runId: RUN_ID,
      status: "succeeded" as const,
      finishedAt: new Date("2026-06-16T00:02:00.000Z"),
      responseBody: "done",
    };

    await service.completeRun(completion);
    await service.completeRun(completion);

    expect(state.run).toMatchObject({ status: "succeeded", responseBody: "done" });
    expect(state.parentSummaryUpdateCount).toBe(1);
  });

  it("accepts a concurrent completion CAS loser after rereading the terminal run", async () => {
    const runningRun: RunState = {
      trigger: "schedule",
      status: "running",
      startedAt: STARTED_AT,
      organizationId: "org-1",
      jobId: "job-1",
      nodeId: NODE_ID,
      finishedAt: null,
      responseBody: null,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
    };
    const { service, state } = createService({ staleRun: runningRun, staleRunReadCount: 2 });
    const completion = {
      actorUserId: ACTOR_USER_ID,
      nodeId: NODE_ID,
      runId: RUN_ID,
      status: "succeeded" as const,
      finishedAt: new Date("2026-06-16T00:02:00.000Z"),
      responseBody: "done",
    };

    await Promise.all([service.completeRun(completion), service.completeRun(completion)]);

    expect(state.run).toMatchObject({ status: "succeeded", responseBody: "done" });
    expect(state.parentSummaryUpdateCount).toBe(1);
  });

  it("denies a completion CAS loser when node ownership is revoked before its reread", async () => {
    const runningRun: RunState = {
      trigger: "schedule",
      status: "running",
      startedAt: STARTED_AT,
      organizationId: "org-1",
      jobId: "job-1",
      nodeId: NODE_ID,
      finishedAt: null,
      responseBody: null,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
    };
    const { service, state } = createService({
      run: runningRun,
      staleRun: runningRun,
      staleRunReadCount: 2,
      shouldRevokeNodeOwnershipAfterCasMiss: true,
    });
    const completion = {
      actorUserId: ACTOR_USER_ID,
      nodeId: NODE_ID,
      runId: RUN_ID,
      status: "succeeded" as const,
      finishedAt: new Date("2026-06-16T00:02:00.000Z"),
      responseBody: "done",
    };

    await expect(
      Promise.all([service.completeRun(completion), service.completeRun(completion)]),
    ).rejects.toBeInstanceOf(AppError);

    expect(state.run).toMatchObject({ status: "succeeded", responseBody: "done" });
  });

  it("denies a completion CAS loser when organization membership is revoked before its reread", async () => {
    const runningRun: RunState = {
      trigger: "schedule",
      status: "running",
      startedAt: STARTED_AT,
      organizationId: "org-1",
      jobId: "job-1",
      nodeId: NODE_ID,
      finishedAt: null,
      responseBody: null,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
    };
    const { service, state } = createService({
      run: runningRun,
      staleRun: runningRun,
      staleRunReadCount: 2,
      shouldRevokeOrganizationMembershipAfterCasMiss: true,
    });
    const completion = {
      actorUserId: ACTOR_USER_ID,
      nodeId: NODE_ID,
      runId: RUN_ID,
      status: "succeeded" as const,
      finishedAt: new Date("2026-06-16T00:02:00.000Z"),
      responseBody: "done",
    };

    await expect(
      Promise.all([service.completeRun(completion), service.completeRun(completion)]),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);

    expect(state.run).toMatchObject({ status: "succeeded", responseBody: "done" });
  });

  it("does not regress the parent summary when an older run completes after a newer run", async () => {
    const { service, state } = createService();
    const newerFinishedAt = new Date("2026-06-16T00:03:00.000Z");

    await service.completeRun({
      actorUserId: ACTOR_USER_ID,
      nodeId: NODE_ID,
      runId: RUN_ID,
      status: "failed",
      finishedAt: newerFinishedAt,
      errorCode: "NEWER_FAILURE",
      errorMessage: "newer run failed",
    });

    state.run = {
      ...state.run,
      status: "running",
      finishedAt: null,
      responseBody: null,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
    };

    await service.completeRun({
      actorUserId: ACTOR_USER_ID,
      nodeId: NODE_ID,
      runId: "run-older",
      status: "succeeded",
      finishedAt: new Date("2026-06-16T00:02:00.000Z"),
    });

    expect(state.parentSummary).toMatchObject({
      lastRunAt: newerFinishedAt,
      lastRunStatus: "failed",
      lastErrorCode: "NEWER_FAILURE",
      lastErrorMessage: "newer run failed",
    });
    expect(state.parentSummaryUpdateCount).toBe(1);
  });

  it("accepts matching terminal details despite nested JSON key reordering", async () => {
    const { service } = createService({
      run: {
        trigger: "manual",
        status: "failed",
        startedAt: STARTED_AT,
        organizationId: "org-1",
        jobId: "job-1",
        nodeId: NODE_ID,
        finishedAt: new Date("2026-06-16T00:02:00.000Z"),
        responseBody: null,
        errorCode: "EXECUTION_FAILED",
        errorMessage: "command failed",
        errorDetails: { outer: { second: 2, first: 1 }, attempts: [{ z: 3, a: 4 }] },
      },
    });

    await expect(
      service.completeRun({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        runId: RUN_ID,
        status: "failed",
        errorCode: "EXECUTION_FAILED",
        errorMessage: "command failed",
        errorDetails: { attempts: [{ a: 4, z: 3 }], outer: { first: 1, second: 2 } },
      }),
    ).resolves.toEqual({ accepted: true });
  });

  it.each(["pending", "running"] as const)(
    "acknowledges a scheduled completion that conflicts with a cleanup terminal result from %s",
    async (staleStatus) => {
      const { service, state } = createService({
        run: {
          trigger: "schedule",
          status: "skipped_offline",
          startedAt: staleStatus === "running" ? STARTED_AT : null,
          organizationId: "org-1",
          jobId: "job-1",
          nodeId: NODE_ID,
          finishedAt: new Date("2026-06-16T00:02:00.000Z"),
          responseBody: null,
          errorCode: "DAEMON_INTERRUPTED",
          errorMessage: "cleaned up",
          errorDetails: null,
        },
        staleRun: {
          trigger: "schedule",
          status: staleStatus,
          startedAt: staleStatus === "running" ? STARTED_AT : null,
          organizationId: "org-1",
          jobId: "job-1",
          nodeId: NODE_ID,
          finishedAt: null,
          responseBody: null,
          errorCode: null,
          errorMessage: null,
          errorDetails: null,
        },
        staleRunReadCount: 1,
      });

      await expect(
        service.completeRun({
          actorUserId: ACTOR_USER_ID,
          nodeId: NODE_ID,
          runId: RUN_ID,
          status: "succeeded",
          responseBody: "local result",
        }),
      ).resolves.toEqual({ accepted: false });
      expect(state.run).toMatchObject({ status: "skipped_offline", errorCode: "DAEMON_INTERRUPTED" });
    },
  );

  it("denies scheduled terminal conflict after node authorization is revoked", async () => {
    const { service } = createService({
      run: {
        trigger: "schedule",
        status: "skipped_offline",
        startedAt: null,
        organizationId: "org-1",
        jobId: "job-1",
        nodeId: NODE_ID,
        finishedAt: STARTED_AT,
        responseBody: null,
        errorCode: "DAEMON_INTERRUPTED",
        errorMessage: "cleaned up",
        errorDetails: null,
      },
      isNodeOwned: false,
    });

    await expect(
      service.completeRun({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        runId: RUN_ID,
        status: "succeeded",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects a conflicting terminal result without replacing the first result", async () => {
    const { service, state } = createService({
      run: {
        trigger: "manual",
        status: "succeeded",
        startedAt: STARTED_AT,
        organizationId: "org-1",
        jobId: "job-1",
        nodeId: NODE_ID,
        finishedAt: new Date("2026-06-16T00:02:00.000Z"),
        responseBody: "first",
        errorCode: null,
        errorMessage: null,
        errorDetails: null,
      },
    });

    await expect(
      service.completeRun({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        runId: RUN_ID,
        status: "failed",
        finishedAt: new Date("2026-06-16T00:03:00.000Z"),
        errorMessage: "conflict",
      }),
    ).rejects.toBeInstanceOf(ScheduledJobRunTransitionUnavailableError);
    expect(state.run).toMatchObject({ status: "succeeded", responseBody: "first" });
    expect(state.parentSummaryUpdateCount).toBe(0);
  });
});
