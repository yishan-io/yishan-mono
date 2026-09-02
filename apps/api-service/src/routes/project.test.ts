import { Hono } from "hono";
import type { ExecutionContext } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectAlreadyExistsError, ProjectCreateFailedError } from "@/errors";
import type { AppEnv } from "@/hono";
import { handleAppError } from "@/middlewares/error";
import { projectRouter } from "@/routes/project";

const neverSettlingRelayPublish = new Promise<void>(() => undefined);

describe("projectRouter relay invalidation", () => {
  let app: Hono<AppEnv>;
  let executionContext: ExecutionContext;
  const allocateLocalTaskKey = vi.fn();
  const createProject = vi.fn();
  const deleteProject = vi.fn();
  const ensureProjectTaskPrefix = vi.fn();
  const getMembershipRole = vi.fn();
  const publishWorkspaceSnapshotChanged = vi.fn();

  beforeEach(() => {
    allocateLocalTaskKey.mockReset();
    createProject.mockReset();
    deleteProject.mockReset();
    ensureProjectTaskPrefix.mockReset();
    getMembershipRole.mockReset();
    publishWorkspaceSnapshotChanged.mockReset();
    getMembershipRole.mockResolvedValue("member");
    publishWorkspaceSnapshotChanged.mockReturnValue(neverSettlingRelayPublish);
    executionContext = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    };
    app = new Hono<AppEnv>();
    app.onError(handleAppError);
    app.use("*", async (c, next) => {
      c.set("sessionUser", { id: "user-1" });
      c.set("services", {
        organization: { getMembershipRole },
        project: { allocateLocalTaskKey, createProject, deleteProject, ensureProjectTaskPrefix },
        relayEvent: { publishWorkspaceSnapshotChanged },
      } as never);
      await next();
    });
    app.route("/", projectRouter);
  });

  it("allocates a project key using only the authenticated route scope", async () => {
    allocateLocalTaskKey.mockResolvedValue({ key: "PROJ-1" });

    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects/project-1/local-tasks/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localTaskId: "task-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ key: "PROJ-1" });
    expect(allocateLocalTaskKey).toHaveBeenCalledWith({
      actorUserId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
      localTaskId: "task-1",
    });
  });

  it("requires organization membership before allocating a project key", async () => {
    getMembershipRole.mockResolvedValue(null);

    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects/project-1/local-tasks/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localTaskId: "task-1" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(allocateLocalTaskKey).not.toHaveBeenCalled();
  });

  it("rejects an allocation body that tries to provide scope", async () => {
    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects/project-1/local-tasks/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localTaskId: "task-1", projectId: "another-project" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(allocateLocalTaskKey).not.toHaveBeenCalled();
  });

  it("ensures a task prefix using the authenticated organization and project route scope", async () => {
    publishWorkspaceSnapshotChanged.mockResolvedValueOnce(undefined);
    ensureProjectTaskPrefix.mockResolvedValue({ id: "project-1", taskPrefix: "PROJ" });

    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects/project-1/task-prefix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ project: { id: "project-1", taskPrefix: "PROJ" } });
    expect(ensureProjectTaskPrefix).toHaveBeenCalledWith({
      actorUserId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
    });
  });

  it("requires organization membership before ensuring a task prefix", async () => {
    getMembershipRole.mockResolvedValue(null);

    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects/project-1/task-prefix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(403);
    expect(ensureProjectTaskPrefix).not.toHaveBeenCalled();
  });

  it("rejects a client-selected task prefix", async () => {
    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects/project-1/task-prefix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskPrefix: "OTHER" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(ensureProjectTaskPrefix).not.toHaveBeenCalled();
  });

  it("returns a created project without awaiting relay invalidation", async () => {
    createProject.mockResolvedValue({ id: "project-1", name: "Project 1" });

    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Project 1", taskPrefix: "PROJ" }),
      }),
      undefined,
      executionContext,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ project: { id: "project-1", name: "Project 1" } });
    expect(executionContext.waitUntil).toHaveBeenCalledWith(neverSettlingRelayPublish);
  });

  it("returns project deletion without awaiting relay invalidation", async () => {
    deleteProject.mockResolvedValue(undefined);

    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects/project-1", { method: "DELETE" }),
      undefined,
      executionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(executionContext.waitUntil).toHaveBeenCalledWith(neverSettlingRelayPublish);
  });
  it("does not expose a project insert failure cause", async () => {
    createProject.mockRejectedValue(new ProjectCreateFailedError(new Error("database connection refused")));

    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Project 1", taskPrefix: "PROJ" }),
      }),
      undefined,
      executionContext,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create project",
      code: "PROJECT_CREATE_FAILED",
    });
  });

  it("returns 409 when project creation conflicts with an existing Git identity", async () => {
    createProject.mockRejectedValue(
      new ProjectAlreadyExistsError({
        organizationId: "org-1",
        repoProvider: "github",
        repoKey: "acme/project-1",
      }),
    );

    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Project 1",
          taskPrefix: "PROJ",
          repoUrl: "https://github.com/acme/project-1.git",
        }),
      }),
      undefined,
      executionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Project already exists",
      code: "PROJECT_ALREADY_EXISTS",
      organizationId: "org-1",
      repoProvider: "github",
      repoKey: "acme/project-1",
    });
  });
});
