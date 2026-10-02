import type { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { nodes, scheduledJobs, workspaces } from "@/db/schema";
import { OrganizationMembershipRequiredError, ScheduledJobClaimUnavailableError } from "@/errors";
import { NodeScheduledJobService } from "@/services/node-scheduled-job-service";
import { describe, expect, it, vi } from "vitest";

const ACTOR_USER_ID = "user-1";
const NODE_ID = "node-1";
const NOW = new Date("2026-06-16T00:00:30.000Z");
const DUE_AT = new Date("2026-06-16T00:00:00.000Z");
const SQL_DIALECT = new PgDialect();

const DUE_JOB = {
  id: "job-1",
  organizationId: "org-1",
  projectId: "project-1",
  nodeId: NODE_ID,
  name: "Nightly sync",
  agentKind: "pi" as const,
  prompt: "safe prompt",
  model: null,
  command: null,
  cronExpression: "* * * * *",
  timezone: "UTC",
  nextRunAt: DUE_AT,
};

type ClaimState = {
  job: typeof DUE_JOB & { status: "active" | "paused" };
  nodeOwnerUserId: string;
  memberUserIds: Set<string>;
  runKeys: Set<string>;
  runTriggers: Set<string>;
  beforeUpdate?: (state: ClaimState) => void;
  workspaceSelectCount: number;
};

type ClaimStateOptions = Partial<Pick<ClaimState, "nodeOwnerUserId" | "memberUserIds" | "runKeys" | "beforeUpdate">>;

function getQueryParams(condition: unknown): unknown[] {
  return SQL_DIALECT.sqlToQuery(condition as ReturnType<typeof sql>).params;
}

function matchesClaimPredicates(params: unknown[], state: ClaimState): boolean {
  const [jobId, jobNodeId, status, nextRunAt, nodeId, scope, ownerUserId, organizationId, memberUserId] = params;
  return (
    jobId === state.job.id &&
    jobNodeId === NODE_ID &&
    jobNodeId === state.job.nodeId &&
    status === "active" &&
    status === state.job.status &&
    nextRunAt === state.job.nextRunAt.toISOString() &&
    nodeId === NODE_ID &&
    scope === "private" &&
    ownerUserId === ACTOR_USER_ID &&
    ownerUserId === state.nodeOwnerUserId &&
    organizationId === state.job.organizationId &&
    memberUserId === ACTOR_USER_ID &&
    state.memberUserIds.has(memberUserId)
  );
}

function cloneState(state: ClaimState): ClaimState {
  return {
    ...state,
    job: { ...state.job },
    memberUserIds: new Set(state.memberUserIds),
    runKeys: new Set(state.runKeys),
    runTriggers: new Set(state.runTriggers),
  };
}

function commitState(target: ClaimState, source: ClaimState): void {
  target.job = source.job;
  target.nodeOwnerUserId = source.nodeOwnerUserId;
  target.memberUserIds = source.memberUserIds;
  target.runKeys = source.runKeys;
  target.runTriggers = source.runTriggers;
  target.workspaceSelectCount = source.workspaceSelectCount;
}

/**
 * A stateful transaction double. Its update is permitted only when every SQL
 * CAS predicate still matches state that may change immediately before it.
 */
function createClaimDb(initialState: ClaimState, stateRef: { current: ClaimState }) {
  const makeDb = (isTransaction: boolean) => {
    const makeSelect = (table: unknown) => {
      let whereCondition: unknown;
      const query = {
        where: vi.fn((condition: unknown) => {
          whereCondition = condition;
          return query;
        }),
        getSQL: () => whereCondition as ReturnType<typeof sql>,
        orderBy: vi.fn(() => query),
        limit: vi.fn(async () => {
          const state = stateRef.current;
          if (table === nodes) {
            return [{ id: NODE_ID, ownerUserId: state.nodeOwnerUserId, scope: "private" }];
          }
          if (table === scheduledJobs) return [state.job];
          if (table === workspaces) {
            state.workspaceSelectCount += 1;
            return [{ localPath: "/private/project" }];
          }
          return [];
        }),
      };
      return query;
    };

    return {
      select: vi.fn(() => ({ from: vi.fn((table: unknown) => makeSelect(table)) })),
      update: vi.fn(() => ({
        set: vi.fn((values: Partial<ClaimState["job"]>) => ({
          where: vi.fn((condition: unknown) => {
            const state = stateRef.current;
            state.beforeUpdate?.(state);
            const canClaim = matchesClaimPredicates(getQueryParams(condition), state);
            if (canClaim) {
              state.job = { ...state.job, ...values };
            }
            return {
              returning: vi.fn(async () => (canClaim ? [{ ...state.job }] : [])),
            };
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((run: { jobId: string; scheduledFor: Date; trigger?: string }) => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => {
              const state = stateRef.current;
              const runKey = `${run.jobId}:${run.scheduledFor.toISOString()}`;
              if (state.runKeys.has(runKey)) return [];
              state.runKeys.add(runKey);
              state.runTriggers.add(run.trigger ?? "missing");
              return [{ id: "run-1" }];
            }),
          })),
        })),
      })),
      transaction: isTransaction
        ? undefined
        : vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
            const transactionState = cloneState(initialState);
            stateRef.current = transactionState;
            try {
              const claimed = await callback(makeDb(true));
              commitState(initialState, transactionState);
              return claimed;
            } finally {
              stateRef.current = initialState;
            }
          }),
    };
  };

  // biome-ignore lint/suspicious/noExplicitAny: stateful Drizzle transaction double
  return makeDb(false) as any;
}

function createService(options: ClaimStateOptions = {}) {
  const state: ClaimState = {
    job: { ...DUE_JOB, status: "active" },
    nodeOwnerUserId: ACTOR_USER_ID,
    memberUserIds: new Set([ACTOR_USER_ID]),
    runKeys: new Set(),
    runTriggers: new Set(),
    workspaceSelectCount: 0,
    ...options,
  };
  const stateRef = { current: state };
  const organizationService = {
    getMembershipRole: vi.fn(async () => (stateRef.current.memberUserIds.has(ACTOR_USER_ID) ? "member" : null)),
    // biome-ignore lint/suspicious/noExplicitAny: focused OrganizationService double
  } as any;
  return {
    service: new NodeScheduledJobService(createClaimDb(state, stateRef), organizationService),
    state,
  };
}

describe("NodeScheduledJobService.claimScheduledJob", () => {
  it.each([
    [
      "the job is paused",
      (state: ClaimState) => {
        state.job.status = "paused";
      },
    ],
    [
      "the job is reassigned",
      (state: ClaimState) => {
        state.job.nodeId = "node-2";
      },
    ],
    [
      "the schedule is moved",
      (state: ClaimState) => {
        state.job.nextRunAt = new Date("2026-06-16T01:00:00.000Z");
      },
    ],
    [
      "node ownership is reassigned",
      (state: ClaimState) => {
        state.nodeOwnerUserId = "another-user";
      },
    ],
    [
      "membership is revoked",
      (state: ClaimState) => {
        state.memberUserIds.clear();
      },
    ],
  ])("does not claim when %s immediately before the CAS", async (_scenario, beforeUpdate) => {
    const { service, state } = createService({ beforeUpdate });

    await expect(
      service.claimScheduledJob({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        jobId: DUE_JOB.id,
        expectedNextRunAt: DUE_AT,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ScheduledJobClaimUnavailableError);
    expect(state.runKeys).toEqual(new Set());
    expect(state.workspaceSelectCount).toBe(0);
  });

  it("creates exactly one run for an occurrence", async () => {
    const { service, state } = createService();

    await expect(
      service.claimScheduledJob({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        jobId: DUE_JOB.id,
        expectedNextRunAt: DUE_AT,
        now: NOW,
      }),
    ).resolves.toMatchObject({ runId: "run-1", scheduledFor: DUE_AT });
    await expect(
      service.claimScheduledJob({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        jobId: DUE_JOB.id,
        expectedNextRunAt: DUE_AT,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ScheduledJobClaimUnavailableError);
    expect(state.job.nextRunAt).toEqual(new Date("2026-06-16T00:01:00.000Z"));
    expect(state.runKeys).toEqual(new Set(["job-1:2026-06-16T00:00:00.000Z"]));
    expect(state.runTriggers).toEqual(new Set(["schedule"]));
  });

  it("rolls back the claim and exposes no project path when the occurrence already has a run", async () => {
    const runKey = "job-1:2026-06-16T00:00:00.000Z";
    const { service, state } = createService({ runKeys: new Set([runKey]) });

    await expect(
      service.claimScheduledJob({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        jobId: DUE_JOB.id,
        expectedNextRunAt: DUE_AT,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ScheduledJobClaimUnavailableError);
    expect(state.job.nextRunAt).toEqual(DUE_AT);
    expect(state.runKeys).toEqual(new Set([runKey]));
    expect(state.workspaceSelectCount).toBe(0);
  });

  it("rejects a member revoked before claim without selecting a project path", async () => {
    const { service, state } = createService({ memberUserIds: new Set() });

    await expect(
      service.claimScheduledJob({
        actorUserId: ACTOR_USER_ID,
        nodeId: NODE_ID,
        jobId: DUE_JOB.id,
        expectedNextRunAt: DUE_AT,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
    expect(state.runKeys).toEqual(new Set());
    expect(state.workspaceSelectCount).toBe(0);
  });
});
