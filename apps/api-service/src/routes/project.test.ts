import { Hono } from "hono";
import type { ExecutionContext } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/hono";
import { projectRouter } from "@/routes/project";

const neverSettlingRelayPublish = new Promise<void>(() => undefined);

describe("projectRouter relay invalidation", () => {
  let app: Hono<AppEnv>;
  let executionContext: ExecutionContext;
  const createProject = vi.fn();
  const deleteProject = vi.fn();
  const getMembershipRole = vi.fn();
  const publishWorkspaceSnapshotChanged = vi.fn();

  beforeEach(() => {
    createProject.mockReset();
    deleteProject.mockReset();
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
    app.use("*", async (c, next) => {
      c.set("sessionUser", { id: "user-1" });
      c.set("services", {
        organization: { getMembershipRole },
        project: { createProject, deleteProject },
        relayEvent: { publishWorkspaceSnapshotChanged },
      } as never);
      await next();
    });
    app.route("/", projectRouter);
  });

  it("returns a created project without awaiting relay invalidation", async () => {
    createProject.mockResolvedValue({ id: "project-1", name: "Project 1" });

    const response = await app.fetch(
      new Request("http://localhost/orgs/org-1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Project 1" }),
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
});
