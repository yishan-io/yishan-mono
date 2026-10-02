import { Hono } from "hono";
import type { ExecutionContext } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/hono";
import { handleAppError } from "@/middlewares/error";
import { projectRouter } from "@/routes/project";

const persistedJob = {
  id: "job-1",
  nodeId: "node-new",
};

const pendingRun = {
  runId: "run-1",
  scheduledFor: new Date("2026-06-16T02:00:00Z"),
  job: {
    ...persistedJob,
    organizationId: "org-1",
    projectId: "project-1",
    agentKind: "pi",
    prompt: "Run the sync",
    model: null,
    command: null,
  },
};

function dispatchFailureResult(status: "running" | "succeeded" | "failed", didMarkDispatchFailed: boolean) {
  return {
    didMarkDispatchFailed,
    run: {
      id: "run-1",
      jobId: "job-1",
      organizationId: "org-1",
      projectId: "project-1",
      nodeId: "node-new",
      scheduledFor: pendingRun.scheduledFor,
      startedAt: status === "running" ? new Date() : null,
      finishedAt: status === "succeeded" || status === "failed" ? new Date() : null,
      status,
      responseBody: null,
      errorCode: status === "failed" ? "QUEUE_DISPATCH_FAILED" : null,
      errorMessage: status === "failed" ? "Scheduled job run could not be dispatched to the queue" : null,
      errorDetails: null,
      createdAt: new Date(),
    },
  };
}

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  };
}

describe("scheduled job relay notifications", () => {
  let app: Hono<AppEnv>;
  let executionContext: ExecutionContext;
  const createScheduledJob = vi.fn();
  const updateScheduledJob = vi.fn();
  const pauseScheduledJob = vi.fn();
  const resumeScheduledJob = vi.fn();
  const disableScheduledJob = vi.fn();
  const deleteScheduledJob = vi.fn();
  const triggerRunNow = vi.fn();
  const markRunNowDispatchFailed = vi.fn();
  const publishScheduledJobScheduleChanged = vi.fn();

  beforeEach(() => {
    createScheduledJob.mockReset();
    updateScheduledJob.mockReset();
    pauseScheduledJob.mockReset();
    resumeScheduledJob.mockReset();
    disableScheduledJob.mockReset();
    deleteScheduledJob.mockReset();
    triggerRunNow.mockReset();
    markRunNowDispatchFailed.mockReset();
    publishScheduledJobScheduleChanged.mockReset();
    publishScheduledJobScheduleChanged.mockRejectedValue(new Error("relay unavailable"));
    executionContext = createExecutionContext();
    app = new Hono<AppEnv>();
    app.onError(handleAppError);
    app.use("*", async (c, next) => {
      c.set("sessionUser", { id: "user-1" });
      c.set("services", {
        organization: { getMembershipRole: vi.fn().mockResolvedValue("member") },
        scheduledJob: {
          createScheduledJob,
          updateScheduledJob,
          pauseScheduledJob,
          resumeScheduledJob,
          disableScheduledJob,
          deleteScheduledJob,
          triggerRunNow,
          markRunNowDispatchFailed,
        },
        relayEvent: { publishScheduledJobScheduleChanged },
      } as never);
      await next();
    });
    app.route("/", projectRouter);
  });

  it("returns persisted CRUD responses despite relay outages and notifies assigned nodes", async () => {
    createScheduledJob.mockResolvedValue({ ...persistedJob, nodeId: "node-create" });
    updateScheduledJob.mockResolvedValue({ job: persistedJob, previousNodeId: "node-old" });
    pauseScheduledJob.mockResolvedValue(persistedJob);
    resumeScheduledJob.mockResolvedValue(persistedJob);
    disableScheduledJob.mockResolvedValue(persistedJob);
    deleteScheduledJob.mockResolvedValue(persistedJob);

    const requests = [
      new Request("http://localhost/orgs/org-1/scheduled-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Nightly sync",
          projectId: "project-1",
          nodeId: "node-create",
          prompt: "Sync",
          cronExpression: "0 2 * * *",
        }),
      }),
      new Request("http://localhost/orgs/org-1/scheduled-jobs/job-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      new Request("http://localhost/orgs/org-1/scheduled-jobs/job-1/pause", { method: "PUT" }),
      new Request("http://localhost/orgs/org-1/scheduled-jobs/job-1/resume", { method: "PUT" }),
      new Request("http://localhost/orgs/org-1/scheduled-jobs/job-1/disable", { method: "PUT" }),
      new Request("http://localhost/orgs/org-1/scheduled-jobs/job-1", { method: "DELETE" }),
    ];

    const responses = [];
    for (const request of requests) {
      responses.push(await app.fetch(request, undefined, executionContext));
    }

    expect(responses.map((response) => response.status)).toEqual([201, 200, 200, 200, 200, 200]);
    expect(executionContext.waitUntil).toHaveBeenCalledTimes(7);
    expect(publishScheduledJobScheduleChanged).toHaveBeenNthCalledWith(1, "node-create");
    expect(publishScheduledJobScheduleChanged).toHaveBeenNthCalledWith(2, "node-old");
    expect(publishScheduledJobScheduleChanged).toHaveBeenNthCalledWith(3, "node-new");
    expect(publishScheduledJobScheduleChanged).toHaveBeenCalledWith("node-new");
  });
});

describe("scheduled job Run Now queue dispatch", () => {
  let app: Hono<AppEnv>;
  let executionContext: ExecutionContext;
  const triggerRunNow = vi.fn();
  const markRunNowDispatchFailed = vi.fn();

  beforeEach(() => {
    triggerRunNow.mockReset();
    markRunNowDispatchFailed.mockReset();
    executionContext = createExecutionContext();
    app = new Hono<AppEnv>();
    app.onError(handleAppError);
    app.use("*", async (c, next) => {
      c.set("sessionUser", { id: "user-1" });
      c.set("services", {
        organization: { getMembershipRole: vi.fn().mockResolvedValue("member") },
        scheduledJob: { triggerRunNow, markRunNowDispatchFailed },
      } as never);
      await next();
    });
    app.route("/", projectRouter);
  });

  function makeRunNowRequest() {
    return new Request("http://localhost/orgs/org-1/scheduled-jobs/job-1/run-now", { method: "POST" });
  }

  it("marks a run failed before returning 503 when the Queue binding is missing", async () => {
    triggerRunNow.mockResolvedValue(pendingRun);
    markRunNowDispatchFailed.mockResolvedValue(dispatchFailureResult("failed", true));

    const response = await app.fetch(makeRunNowRequest(), undefined, executionContext);

    expect(response.status).toBe(503);
    expect(markRunNowDispatchFailed).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", jobId: "job-1", runId: "run-1", actorUserId: "user-1" }),
    );
  });

  it("marks a run failed before returning 503 when Queue send fails", async () => {
    triggerRunNow.mockResolvedValue(pendingRun);
    markRunNowDispatchFailed.mockResolvedValue(dispatchFailureResult("failed", true));
    const queue = { send: vi.fn().mockRejectedValue(new Error("queue unavailable")) };

    const response = await app.fetch(makeRunNowRequest(), { SCHEDULED_JOB_QUEUE: queue } as never, executionContext);

    expect(response.status).toBe(503);
    expect(markRunNowDispatchFailed).toHaveBeenCalledTimes(1);
  });

  it.each(["running", "succeeded"] as const)(
    "returns the authoritative %s run when Queue send outcome is uncertain",
    async (status) => {
      triggerRunNow.mockResolvedValue(pendingRun);
      markRunNowDispatchFailed.mockResolvedValue(dispatchFailureResult(status, false));

      const response = await app.fetch(makeRunNowRequest(), undefined, executionContext);

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({ run: { id: "run-1", status } });
    },
  );

  it("keeps the successful Queue publish response unchanged", async () => {
    triggerRunNow.mockResolvedValue(pendingRun);
    const queue = { send: vi.fn().mockResolvedValue(undefined) };

    const response = await app.fetch(makeRunNowRequest(), { SCHEDULED_JOB_QUEUE: queue } as never, executionContext);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ ok: true, run: { id: "run-1", status: "pending" } });
    expect(markRunNowDispatchFailed).not.toHaveBeenCalled();
  });
});
