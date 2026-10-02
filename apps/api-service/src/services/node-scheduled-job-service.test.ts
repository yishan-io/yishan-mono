import type { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { nodes, scheduledJobs, workspaces } from "@/db/schema";
import { WorkspaceLocalNodePermissionRequiredError } from "@/errors";
import { NodeScheduledJobService } from "@/services/node-scheduled-job-service";
import { describe, expect, it, vi } from "vitest";

const ACTOR_USER_ID = "user-1";
const NODE_ID = "node-1";
const ORGANIZATION_ID = "org-accessible";
const NOW = new Date("2026-06-16T00:00:30.000Z");
const STALE_NEXT_RUN_AT = new Date("2026-06-15T00:00:00.000Z");
const SQL_DIALECT = new PgDialect();

const STALE_JOB = {
  id: "job-accessible",
  organizationId: ORGANIZATION_ID,
  projectId: "project-1",
  nodeId: NODE_ID,
  name: "Nightly sync",
  agentKind: "pi" as const,
  prompt: "safe prompt",
  model: null,
  command: null,
  cronExpression: "* * * * *",
  timezone: "UTC",
  status: "active" as const,
  nextRunAt: STALE_NEXT_RUN_AT,
};

type FakeJob = Omit<typeof STALE_JOB, "status"> & { status: "active" | "paused" };

type FakeDbState = {
  job: FakeJob;
  nodeOwnerUserId: string;
  memberUserIds: Set<string>;
  beforeUpdate?: () => void;
  insertedRunIds: string[];
  insertedRunValues: Record<string, unknown>[];
};

function getSql(condition: unknown): string {
  return SQL_DIALECT.sqlToQuery(condition as ReturnType<typeof sql>).sql;
}

function hasColumnPredicate(querySql: string, table: string, column: string, operator: string) {
  return querySql.includes(`"${table}"."${column}" ${operator}`);
}

/**
 * A stateful Drizzle double. It returns rows only when the SQL predicate permits
 * the current state, including state changes injected immediately before a CAS.
 */
function createStatefulFakeDb(state: FakeDbState) {
  const makeLimitedResult = (rows: unknown[], condition: unknown) => ({
    getSQL: () => condition as ReturnType<typeof sql>,
    limit: vi.fn().mockResolvedValue(rows),
  });

  const db = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        const joins: string[] = [];
        const query = {
          innerJoin: vi.fn((_joinedTable: unknown, condition: unknown) => {
            joins.push(getSql(condition));
            return query;
          }),
          where: vi.fn((condition: unknown) => {
            const querySql = getSql(condition);
            if (table === nodes) {
              return makeLimitedResult(
                [{ id: NODE_ID, ownerUserId: state.nodeOwnerUserId, scope: "private" }],
                condition,
              );
            }

            if (table === scheduledJobs && joins.length === 0) {
              return makeLimitedResult([state.job], condition);
            }
            if (table === workspaces) {
              return {
                orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
              };
            }

            const hasOwnerJoin = joins.some((joinSql) => hasColumnPredicate(joinSql, "nodes", "owner_user_id", "="));
            const hasMembershipJoin = joins.some((joinSql) =>
              hasColumnPredicate(joinSql, "organization_members", "user_id", "="),
            );
            const hasActiveStatus = hasColumnPredicate(querySql, "scheduled_jobs", "status", "=");
            const isVisible =
              (!hasOwnerJoin || state.nodeOwnerUserId === ACTOR_USER_ID) &&
              (!hasMembershipJoin || state.memberUserIds.has(ACTOR_USER_ID)) &&
              (!hasActiveStatus || state.job.status === "active");
            return isVisible ? [state.job] : [];
          }),
        };
        return query;
      }),
    })),
    transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db)),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        state.insertedRunValues.push(values);
        return {
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(() => {
              const runId = `run-${state.insertedRunIds.length + 1}`;
              state.insertedRunIds.push(runId);
              return Promise.resolve([{ id: runId }]);
            }),
          })),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Partial<FakeJob> & { updatedAt: Date }) => ({
        where: vi.fn((condition: unknown) => {
          state.beforeUpdate?.();
          const querySql = getSql(condition);
          const protectsOwnership = hasColumnPredicate(querySql, "nodes", "owner_user_id", "=");
          const protectsMembership = hasColumnPredicate(querySql, "organization_members", "user_id", "=");
          const protectsStatus = hasColumnPredicate(querySql, "scheduled_jobs", "status", "=");
          const protectsNextRunAt = hasColumnPredicate(querySql, "scheduled_jobs", "next_run_at", "=");
          const canUpdate =
            (!protectsOwnership || state.nodeOwnerUserId === ACTOR_USER_ID) &&
            (!protectsMembership || state.memberUserIds.has(ACTOR_USER_ID)) &&
            (!protectsStatus || state.job.status === "active") &&
            (!protectsNextRunAt || state.job.nextRunAt.getTime() === STALE_NEXT_RUN_AT.getTime());
          if (canUpdate) {
            state.job = { ...state.job, ...values };
          }
          return {
            returning: vi.fn().mockResolvedValue(canUpdate ? [{ ...state.job }] : []),
          };
        }),
      })),
    })),
  };

  // biome-ignore lint/suspicious/noExplicitAny: stateful Drizzle test double
  return db as any;
}

function makeOrgService(afterMembershipCheck?: () => void) {
  return {
    getMembershipRole: vi.fn().mockImplementation(() => {
      afterMembershipCheck?.();
      return Promise.resolve("member");
    }),
    // biome-ignore lint/suspicious/noExplicitAny: OrganizationService test double
  } as any;
}

function createService(state: Partial<FakeDbState> = {}, afterMembershipCheck?: () => void) {
  const fakeState: FakeDbState = {
    job: { ...STALE_JOB },
    nodeOwnerUserId: ACTOR_USER_ID,
    memberUserIds: new Set([ACTOR_USER_ID]),
    insertedRunIds: [],
    insertedRunValues: [],
    ...state,
  };
  return {
    service: new NodeScheduledJobService(createStatefulFakeDb(fakeState), makeOrgService(afterMembershipCheck)),
    fakeState,
  };
}

describe("NodeScheduledJobService reconciliation", () => {
  it("rejects reconciliation for a node not owned by the actor", async () => {
    const { service } = createService({ nodeOwnerUserId: "another-user" });

    await expect(
      service.reconcileScheduledJobs({ actorUserId: ACTOR_USER_ID, nodeId: NODE_ID, protectedJobs: [] }),
    ).rejects.toBeInstanceOf(WorkspaceLocalNodePermissionRequiredError);
  });

  it("keeps a protected overdue occurrence available for a concurrent claim", async () => {
    const { service, fakeState } = createService();

    await expect(
      service.reconcileScheduledJobs({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        protectedJobs: [{ jobId: STALE_JOB.id, nextRunAt: STALE_NEXT_RUN_AT }],
        now: NOW,
      }),
    ).resolves.toMatchObject([{ id: STALE_JOB.id, nextRunAt: STALE_NEXT_RUN_AT }]);
    expect(fakeState.job.nextRunAt).toEqual(STALE_NEXT_RUN_AT);
  });

  it("does not preserve a protected tuple after its claim advances the schedule", async () => {
    const { service, fakeState } = createService();
    const claimNow = new Date("2026-06-15T00:00:30.000Z");
    const nextRunAt = new Date("2026-06-15T00:01:00.000Z");

    await expect(
      service.claimScheduledJob({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        jobId: STALE_JOB.id,
        expectedNextRunAt: STALE_NEXT_RUN_AT,
        now: claimNow,
      }),
    ).resolves.toMatchObject({ scheduledFor: STALE_NEXT_RUN_AT });

    await expect(
      service.reconcileScheduledJobs({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        protectedJobs: [{ jobId: STALE_JOB.id, nextRunAt: STALE_NEXT_RUN_AT }],
        now: claimNow,
      }),
    ).resolves.toMatchObject([{ id: STALE_JOB.id, nextRunAt }]);
    expect(fakeState.insertedRunIds).toHaveLength(1);
    expect(fakeState.insertedRunValues).toEqual([expect.objectContaining({ trigger: "schedule" })]);
    expect(fakeState.job.nextRunAt).toEqual(nextRunAt);
  });

  it("skips an unprotected overdue occurrence at startup", async () => {
    const { service, fakeState } = createService();

    await expect(
      service.reconcileScheduledJobs({ actorUserId: ACTOR_USER_ID, nodeId: NODE_ID, protectedJobs: [], now: NOW }),
    ).resolves.toMatchObject([{ id: STALE_JOB.id, nextRunAt: new Date("2026-06-16T00:01:00.000Z") }]);
    expect(fakeState.job.nextRunAt).toEqual(new Date("2026-06-16T00:01:00.000Z"));
  });

  it.each([
    ["membership is revoked", (state: FakeDbState) => state.memberUserIds.clear()],
    [
      "node ownership is reassigned",
      (state: FakeDbState) => {
        state.nodeOwnerUserId = "another-user";
      },
    ],
    [
      "the schedule is edited",
      (state: FakeDbState) => {
        state.job.nextRunAt = new Date("2026-06-16T01:00:00.000Z");
      },
    ],
    [
      "the job is paused",
      (state: FakeDbState) => {
        state.job.status = "paused";
      },
    ],
  ])("does not fast-forward when %s immediately before the CAS", async (_scenario, mutateBeforeUpdate) => {
    const { service, fakeState } = createService({ beforeUpdate: undefined });
    fakeState.beforeUpdate = () => mutateBeforeUpdate(fakeState);

    const reconciled = await service.reconcileScheduledJobs({
      actorUserId: ACTOR_USER_ID,
      nodeId: NODE_ID,
      protectedJobs: [],
      now: NOW,
    });
    if (_scenario === "the schedule is edited") {
      expect(reconciled).toMatchObject([{ id: STALE_JOB.id, nextRunAt: new Date("2026-06-16T01:00:00.000Z") }]);
      return;
    }
    expect(reconciled).toEqual([]);
  });
});
