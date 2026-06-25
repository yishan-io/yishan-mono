import { scheduledJobs } from "@/db/schema";
import { OrganizationMembershipRequiredError, ScheduledJobNotFoundError } from "@/errors";
import { ScheduledJobService } from "@/services/scheduled-job-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Shared fixtures ────────────────────────────────────────────────────────────

const JOB_ROW = {
  id: "job-1",
  organizationId: "org-1",
  projectId: "proj-1",
  nodeId: "node-1",
  name: "Nightly sync",
  agentKind: "opencode" as const,
  prompt: "Run the sync",
  model: null,
  command: null,
  cronExpression: "0 2 * * *",
  timezone: "UTC",
  status: "active" as const,
  nextRunAt: new Date("2026-06-16T02:00:00Z"),
  lastScheduledFor: null,
  lastRunAt: null,
  lastRunStatus: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdByUserId: "user-1",
  createdAt: new Date("2026-06-15T00:00:00Z"),
  updatedAt: new Date("2026-06-15T00:00:00Z"),
};

// ── Mock builder ───────────────────────────────────────────────────────────────

function createMockDb(presetRows?: Record<string, unknown>[][]) {
  let callCount = 0;

  const mockLimit = vi.fn().mockImplementation(() => {
    const rows = presetRows?.[callCount++] ?? [];
    return Promise.resolve(rows);
  });
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  const mockInsertReturning = vi.fn().mockResolvedValue([JOB_ROW]);
  const mockInsertValues = vi.fn().mockReturnValue({ returning: mockInsertReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

  const mockUpdateReturning = vi.fn().mockResolvedValue([JOB_ROW]);
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

  // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
  const db = { select: mockSelect, insert: mockInsert, update: mockUpdate } as any;

  return {
    db,
    mockSelect,
    mockFrom,
    mockWhere,
    mockLimit,
    mockInsert,
    mockInsertValues,
    mockInsertReturning,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockUpdateReturning,
  };
}

/** OrganizationService stub — getMembershipRole returns 'member' by default */
function makeOrgService(role: string | null = "member") {
  return {
    getMembershipRole: vi.fn().mockResolvedValue(role),
    // biome-ignore lint/suspicious/noExplicitAny: stub
  } as any;
}

// ── createScheduledJob ─────────────────────────────────────────────────────────

describe("ScheduledJobService.createScheduledJob", () => {
  it("throws OrganizationMembershipRequiredError when actor is not a member", async () => {
    const { db } = createMockDb();
    const service = new ScheduledJobService(db, makeOrgService(null));

    await expect(
      service.createScheduledJob({
        organizationId: "org-1",
        projectId: "proj-1",
        actorUserId: "user-x",
        name: "Job",
        nodeId: "node-1",
        prompt: "Do work",
        cronExpression: "0 0 * * *",
      }),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
  });

  it("inserts a job and returns a view when all guards pass", async () => {
    // Rows: [project check, node check]
    const { db, mockInsert, mockInsertReturning, mockLimit } = createMockDb();
    // project exists + node exists (assertNodeOwnedByActor uses shared helper)
    mockLimit
      .mockResolvedValueOnce([{ id: "proj-1" }]) // assertProjectBelongsToOrganization
      .mockResolvedValueOnce([{ id: "node-1", scope: "private", ownerUserId: "user-1" }]); // assertNodeOwnedByActor

    const service = new ScheduledJobService(db, makeOrgService("member"));

    const result = await service.createScheduledJob({
      organizationId: "org-1",
      projectId: "proj-1",
      actorUserId: "user-1",
      name: "Nightly sync",
      nodeId: "node-1",
      prompt: "Do work",
      cronExpression: "0 2 * * *",
    });

    expect(mockInsert).toHaveBeenCalledWith(scheduledJobs);
    expect(result.id).toBe("job-1");
    expect(result.name).toBe("Nightly sync");
  });

  it("throws for an invalid cron expression", async () => {
    const { db, mockLimit } = createMockDb();
    mockLimit
      .mockResolvedValueOnce([{ id: "proj-1" }])
      .mockResolvedValueOnce([{ id: "node-1", scope: "private", ownerUserId: "user-1" }]);

    const service = new ScheduledJobService(db, makeOrgService("member"));

    await expect(
      service.createScheduledJob({
        organizationId: "org-1",
        projectId: "proj-1",
        actorUserId: "user-1",
        name: "Job",
        nodeId: "node-1",
        prompt: "x",
        cronExpression: "not a cron",
      }),
    ).rejects.toThrow();
  });
});

// ── listScheduledJobs ──────────────────────────────────────────────────────────

describe("ScheduledJobService.listScheduledJobs", () => {
  it("throws OrganizationMembershipRequiredError when actor is not a member", async () => {
    const { db } = createMockDb();
    const service = new ScheduledJobService(db, makeOrgService(null));

    await expect(service.listScheduledJobs({ organizationId: "org-1", actorUserId: "user-x" })).rejects.toBeInstanceOf(
      OrganizationMembershipRequiredError,
    );
  });

  it("returns an empty array when no jobs exist", async () => {
    const { db, mockFrom } = createMockDb();
    // listScheduledJobs queries without .limit() — mock directly
    mockFrom.mockReturnValueOnce({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    });

    const service = new ScheduledJobService(db, makeOrgService("member"));
    const jobs = await service.listScheduledJobs({ organizationId: "org-1", actorUserId: "user-1" });

    expect(jobs).toEqual([]);
  });
});

// ── pauseScheduledJob / resumeScheduledJob / disableScheduledJob / deleteScheduledJob ──

describe("ScheduledJobService status mutations", () => {
  function makeServiceWithJob(status = "active") {
    const { db, mockLimit, mockUpdateReturning } = createMockDb();
    // getMembershipRole: member
    // getJobOrThrow: returns the job
    mockLimit.mockResolvedValueOnce([{ ...JOB_ROW, status }]); // getJobOrThrow

    mockUpdateReturning.mockResolvedValue([{ ...JOB_ROW, status }]);
    const service = new ScheduledJobService(db, makeOrgService("member"));
    return { service, mockUpdateReturning };
  }

  it("pauseScheduledJob throws ScheduledJobNotFoundError when job does not exist", async () => {
    const { db, mockLimit } = createMockDb();
    mockLimit.mockResolvedValueOnce([]); // getJobOrThrow returns nothing
    const service = new ScheduledJobService(db, makeOrgService("member"));

    await expect(
      service.pauseScheduledJob({ organizationId: "org-1", jobId: "missing", actorUserId: "u1" }),
    ).rejects.toBeInstanceOf(ScheduledJobNotFoundError);
  });

  it("pauseScheduledJob returns a view on success", async () => {
    const { service } = makeServiceWithJob("active");
    const result = await service.pauseScheduledJob({
      organizationId: "org-1",
      jobId: "job-1",
      actorUserId: "user-1",
    });
    expect(result.id).toBe("job-1");
  });

  it("disableScheduledJob throws ScheduledJobNotFoundError when job does not exist", async () => {
    const { db, mockLimit } = createMockDb();
    mockLimit.mockResolvedValueOnce([]);
    const service = new ScheduledJobService(db, makeOrgService("member"));

    await expect(
      service.disableScheduledJob({ organizationId: "org-1", jobId: "missing", actorUserId: "u1" }),
    ).rejects.toBeInstanceOf(ScheduledJobNotFoundError);
  });

  it("deleteScheduledJob throws ScheduledJobNotFoundError when job does not exist", async () => {
    const { db, mockLimit } = createMockDb();
    mockLimit.mockResolvedValueOnce([]);
    const service = new ScheduledJobService(db, makeOrgService("member"));

    await expect(
      service.deleteScheduledJob({ organizationId: "org-1", jobId: "missing", actorUserId: "u1" }),
    ).rejects.toBeInstanceOf(ScheduledJobNotFoundError);
  });

  it("deleteScheduledJob marks the job as deleted", async () => {
    const { db, mockLimit, mockUpdateSet } = createMockDb();
    mockLimit.mockResolvedValueOnce([{ ...JOB_ROW, status: "active" }]);
    const service = new ScheduledJobService(db, makeOrgService("member"));

    await service.deleteScheduledJob({ organizationId: "org-1", jobId: "job-1", actorUserId: "user-1" });

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "deleted",
      }),
    );
  });
});

// ── listJobRuns ────────────────────────────────────────────────────────────────

describe("ScheduledJobService.listJobRuns", () => {
  it("throws OrganizationMembershipRequiredError when actor is not a member", async () => {
    const { db } = createMockDb();
    const service = new ScheduledJobService(db, makeOrgService(null));

    await expect(
      service.listJobRuns({ organizationId: "org-1", jobId: "job-1", actorUserId: "x" }),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
  });
});

describe("ScheduledJobService.triggerRunNow", () => {
  it("throws ScheduledJobNotFoundError when job does not exist", async () => {
    const { db, mockLimit } = createMockDb();
    mockLimit.mockResolvedValueOnce([]);
    const service = new ScheduledJobService(db, makeOrgService("member"));

    await expect(
      service.triggerRunNow({ organizationId: "org-1", jobId: "missing", actorUserId: "u1" }),
    ).rejects.toBeInstanceOf(ScheduledJobNotFoundError);
  });

  it("creates a pending run and returns run info", async () => {
    const { db, mockLimit, mockInsert, mockInsertValues } = createMockDb();
    mockLimit.mockResolvedValueOnce([{ ...JOB_ROW, status: "active" }]);
    mockInsertValues.mockResolvedValueOnce(undefined);
    const service = new ScheduledJobService(db, makeOrgService("member"));

    const run = await service.triggerRunNow({ organizationId: "org-1", jobId: "job-1", actorUserId: "user-1" });

    expect(mockInsert).toHaveBeenCalled();
    expect(run.job.id).toBe("job-1");
    expect(run.runId).toBeTruthy();
  });
});
