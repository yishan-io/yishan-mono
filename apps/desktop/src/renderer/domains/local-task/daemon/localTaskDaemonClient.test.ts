import { describe, expect, it, vi } from "vitest";
import { DaemonLocalTaskClient } from "./localTaskDaemonClient";

const taskPayload = {
  id: "task-1",
  projectId: "project-1",
  title: "Ship desktop",
  description: "Add the Local Task client",
  status: "active",
  priority: "high",
  createdAt: "2026-08-24T01:00:00Z",
  updatedAt: "2026-08-24T01:10:00Z",
  completedAt: null,
};

const linkPayload = {
  id: "link-1",
  localTaskId: "task-1",
  workspaceId: "workspace-1",
  role: "primary",
  status: "active",
  linkedAt: "2026-08-24T01:15:00Z",
  unlinkedAt: null,
};

describe("DaemonLocalTaskClient", () => {
  it("uses the complete Local Task RPC method and parameter contract", async () => {
    const invoke = vi.fn(async (method: string) => {
      if (
        method === "localTask.list" ||
        method === "localTask.listWorkspaceLinks" ||
        method === "localTask.listTaskLinks"
      ) {
        return method === "localTask.list" ? [taskPayload] : [linkPayload];
      }
      if (method === "localTask.search") return [{ ...taskPayload, rank: -0.5 }];
      if (method === "localTask.getContextDetails") {
        return {
          directory: "/context/task-1",
          planPath: "/context/task-1/plan.md",
          notesPath: "/context/task-1/notes.md",
          outcomePath: "/context/task-1/outcome.md",
        };
      }
      if (method === "localTask.unlinkWorkspace") return null;
      if (method.includes("Workspace") || method === "localTask.setPrimary") return linkPayload;
      return taskPayload;
    });
    const client = new DaemonLocalTaskClient(invoke);

    await client.create({ title: "Ship desktop", priority: "high" });
    await client.get("task-1");
    await client.list({ projectId: "project-1", status: "active", priority: "high", workspaceId: "workspace-1" });
    await client.search("desktop", { status: "active" });
    await client.update("task-1", { status: "completed" });
    await client.getContext("task-1");
    await client.linkWorkspace("task-1", "workspace-1", "related");
    await client.unlinkWorkspace("link-1");
    await client.setPrimary("task-1", "workspace-1");
    await client.updateLinkStatus("link-1", "paused");
    await client.listWorkspaceLinks("workspace-1");
    await client.listTaskLinks("task-1");

    expect(invoke.mock.calls).toEqual([
      ["localTask.create", { title: "Ship desktop", priority: "high" }],
      ["localTask.get", { id: "task-1" }],
      ["localTask.list", { projectId: "project-1", status: "active", priority: "high", workspaceId: "workspace-1" }],
      ["localTask.search", { query: "desktop", status: "active" }],
      ["localTask.update", { id: "task-1", status: "completed" }],
      ["localTask.getContextDetails", { id: "task-1" }],
      ["localTask.linkWorkspace", { taskId: "task-1", workspaceId: "workspace-1", role: "related" }],
      ["localTask.unlinkWorkspace", { linkId: "link-1" }],
      ["localTask.setPrimary", { taskId: "task-1", workspaceId: "workspace-1" }],
      ["localTask.updateWorkspaceLinkStatus", { linkId: "link-1", status: "paused" }],
      ["localTask.listWorkspaceLinks", { workspaceId: "workspace-1" }],
      ["localTask.listTaskLinks", { id: "task-1" }],
    ]);
  });

  it("parses the nullable fields emitted by Go JSON encoding", async () => {
    const encodedTaskPayload = { ...taskPayload, projectId: null, completedAt: null };
    const encodedLinkPayload = { ...linkPayload, unlinkedAt: null };
    const invoke = vi.fn(async (method: string) =>
      method === "localTask.listTaskLinks" ? [encodedLinkPayload] : encodedTaskPayload,
    );
    const client = new DaemonLocalTaskClient(invoke);

    await expect(client.get("task-1")).resolves.toMatchObject({ projectId: null, completedAt: null });
    await expect(client.listTaskLinks("task-1")).resolves.toEqual([encodedLinkPayload]);
  });

  it("preserves exact task strings and permits an empty description", async () => {
    const exactPayload = { ...taskPayload, title: "  Ship desktop  ", description: "  details  " };
    const exactClient = new DaemonLocalTaskClient(vi.fn(async () => exactPayload));
    const emptyClient = new DaemonLocalTaskClient(vi.fn(async () => ({ ...taskPayload, description: "" })));

    await expect(exactClient.get("task-1")).resolves.toMatchObject({
      title: "  Ship desktop  ",
      description: "  details  ",
    });
    await expect(emptyClient.get("task-1")).resolves.toMatchObject({ description: "" });
  });

  it.each([
    [
      "missing description",
      (payload: typeof taskPayload) => {
        const { description: _description, ...taskWithoutDescription } = payload;
        return taskWithoutDescription;
      },
    ],
    ["non-string description", (payload: typeof taskPayload) => ({ ...payload, description: 1 })],
    [
      "missing nullable field",
      (payload: typeof taskPayload) => {
        const { completedAt: _completedAt, ...taskWithoutCompletedAt } = payload;
        return taskWithoutCompletedAt;
      },
    ],
    ["invalid status", (payload: typeof taskPayload) => ({ ...payload, status: "unknown" })],
  ])("rejects %s", async (_name, buildPayload) => {
    const client = new DaemonLocalTaskClient(vi.fn(async () => buildPayload(taskPayload)));

    await expect(client.get("task-1")).rejects.toThrow("invalid Local Task payload");
  });
});
