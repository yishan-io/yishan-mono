import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/hono";
import { requireAuthUser } from "@/middlewares/auth";
import { handleAppError } from "@/middlewares/error";
import { nodeRouter } from "@/routes/node";

describe("nodeRouter scheduled jobs", () => {
  const claimScheduledJob = vi.fn();
  const markRunStarted = vi.fn();
  const completeRun = vi.fn();
  const reconcileScheduledJobs = vi.fn();
  let app: Hono<AppEnv>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = new Hono<AppEnv>();
    app.onError(handleAppError);
    app.use("*", async (c, next) => {
      c.set("sessionUser", { id: "user-1" });
      c.set("services", {
        nodeScheduledJob: { claimScheduledJob, reconcileScheduledJobs },
        nodeScheduledJobRun: { markRunStarted, completeRun },
      } as never);
      await next();
    });
    app.route("/", nodeRouter);
  });

  it("starts a run without a rollout gate", async () => {
    markRunStarted.mockResolvedValue(true);
    const response = await app.fetch(
      new Request("http://localhost/nodes/node-1/scheduled-jobs/runs/start", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-1", startedAt: "2026-06-16T00:00:00.000Z" }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, started: true });
    expect(markRunStarted).toHaveBeenCalledWith({
      actorUserId: "user-1",
      nodeId: "node-1",
      runId: "run-1",
      startedAt: new Date("2026-06-16T00:00:00.000Z"),
    });
  });

  it("reconciles and claims directly", async () => {
    reconcileScheduledJobs.mockResolvedValue([{ id: "job-1" }]);
    claimScheduledJob.mockResolvedValue({ runId: "run-1" });
    const reconcileResponse = await app.fetch(
      new Request("http://localhost/nodes/node-1/scheduled-jobs/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protectedJobs: [] }),
      }),
    );
    const claimResponse = await app.fetch(
      new Request("http://localhost/nodes/node-1/scheduled-jobs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: "job-1", expectedNextRunAt: "2026-06-16T00:00:00.000Z" }),
      }),
    );
    expect(reconcileResponse.status).toBe(200);
    expect(claimResponse.status).toBe(200);
    expect(reconcileScheduledJobs).toHaveBeenCalledWith({ actorUserId: "user-1", nodeId: "node-1", protectedJobs: [] });
    expect(claimScheduledJob).toHaveBeenCalledWith({
      actorUserId: "user-1",
      nodeId: "node-1",
      jobId: "job-1",
      expectedNextRunAt: new Date("2026-06-16T00:00:00.000Z"),
    });
  });

  it("validates node requests before calling their services", async () => {
    const response = await app.fetch(
      new Request("http://localhost/nodes/node-1/scheduled-jobs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: "job-1" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(claimScheduledJob).not.toHaveBeenCalled();
  });

  it("requires node authentication", async () => {
    const protectedApp = new Hono<AppEnv>();
    protectedApp.onError(handleAppError);
    protectedApp.use("*", async (c, next) => {
      c.set("services", { nodeScheduledJob: { claimScheduledJob, reconcileScheduledJobs } } as never);
      await next();
    });
    protectedApp.use("*", requireAuthUser);
    protectedApp.route("/", nodeRouter);
    const response = await protectedApp.fetch(
      new Request("http://localhost/nodes/node-1/scheduled-jobs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: "job-1", expectedNextRunAt: "2026-06-16T00:00:00.000Z" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns an accepted false completion conflict", async () => {
    completeRun.mockResolvedValue({ accepted: false });
    const response = await app.fetch(
      new Request("http://localhost/nodes/node-1/scheduled-jobs/runs/complete", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-1", status: "succeeded" }),
      }),
    );
    await expect(response.json()).resolves.toEqual({ ok: true, accepted: false });
  });
});
