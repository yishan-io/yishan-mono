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
  tags: [],
  tagRefs: [{ id: "tag-desktop", name: "Desktop" }],
};

const linkPayload = {
  id: "link-1",
  localTaskId: "task-1",
  workspaceId: "workspace-1",
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
      if (method === "localTask.listTags") return ["desktop", "cli"];
      if (method === "localTask.listTagCatalog" || method === "localTask.updateTagColor")
        return method === "localTask.listTagCatalog"
          ? [
              {
                id: "tag-desktop",
                key: "desktop",
                name: "Desktop",
                aliases: ["Desktop"],
                color: "#3B82F6",
              },
            ]
          : {
              id: "tag-desktop",
              key: "desktop",
              name: "Desktop",
              aliases: ["Desktop"],
              color: "#3B82F6",
            };
      if (method === "localTask.renameTag") {
        return {
          tag: {
            id: "tag-desktop",
            key: "desktop",
            name: "Desktop",
            aliases: ["Desktop"],
            color: "#3B82F6",
          },
          removedTagId: "tag-merged",
        };
      }
      if (method === "localTask.deleteTag") return { deletedTagId: "tag-desktop" };
      if (method === "localTask.getContextDetails") {
        return {
          directory: "/context/task-1",
          planPath: "/context/task-1/plan.md",
          notesPath: "/context/task-1/notes.md",
          outcomePath: "/context/task-1/outcome.md",
        };
      }
      if (method === "localTask.unlinkWorkspace") return null;
      if (method.includes("Workspace")) return linkPayload;
      return taskPayload;
    });
    const client = new DaemonLocalTaskClient(invoke);

    await client.create({ title: "Ship desktop", priority: "high", tagIds: ["tag-desktop"] });
    await client.get("task-1");
    await client.list({
      projectId: "project-1",
      status: "active",
      priority: "high",
      workspaceId: "workspace-1",
      tags: ["desktop", "cli"],
      tagIds: ["tag-desktop", "tag-cli"],
    });
    await client.search("desktop", { status: "active", tags: ["desktop"], tagIds: ["tag-desktop"] });
    await client.listTags();
    await client.listTagCatalog();
    await client.updateTagColor("tag-desktop", "#3B82F6");
    await client.update("task-1", { status: "completed", tagIds: [] });
    await client.renameTag("tag-merged", "Desktop");
    await client.deleteTag("tag-desktop");
    await client.getContext("task-1");
    await client.linkWorkspace("task-1", "workspace-1");
    await client.unlinkWorkspace("link-1");
    await client.updateLinkStatus("link-1", "paused");
    await client.listWorkspaceLinks("workspace-1");
    await client.listTaskLinks("task-1");

    expect(invoke.mock.calls).toEqual([
      ["localTask.create", { title: "Ship desktop", priority: "high", tagRefs: [{ id: "tag-desktop" }] }],
      ["localTask.get", { id: "task-1" }],
      [
        "localTask.list",
        {
          projectId: "project-1",
          status: "active",
          priority: "high",
          workspaceId: "workspace-1",
          tags: ["desktop", "cli"],
          tagIds: ["tag-desktop", "tag-cli"],
        },
      ],
      ["localTask.search", { query: "desktop", status: "active", tags: ["desktop"], tagIds: ["tag-desktop"] }],
      ["localTask.listTags", {}],
      ["localTask.listTagCatalog", {}],
      ["localTask.updateTagColor", { id: "tag-desktop", color: "#3B82F6" }],
      ["localTask.update", { id: "task-1", status: "completed", tagRefs: [] }],
      ["localTask.renameTag", { id: "tag-merged", name: "Desktop" }],
      ["localTask.deleteTag", { id: "tag-desktop" }],
      ["localTask.getContextDetails", { id: "task-1" }],
      ["localTask.linkWorkspace", { taskId: "task-1", workspaceId: "workspace-1" }],
      ["localTask.unlinkWorkspace", { linkId: "link-1" }],
      ["localTask.updateWorkspaceLinkStatus", { linkId: "link-1", status: "paused" }],
      ["localTask.listWorkspaceLinks", { workspaceId: "workspace-1" }],
      ["localTask.listTaskLinks", { id: "task-1" }],
    ]);
  });

  it("preserves removedTagId from a tag merge", async () => {
    const client = new DaemonLocalTaskClient(
      vi.fn(async () => ({
        tag: { id: "tag-target", key: "target", name: "Target", aliases: ["Target"], color: null },
        removedTagId: "tag-source",
      })),
    );

    await expect(client.renameTag("tag-source", "Target")).resolves.toEqual({
      tag: { id: "tag-target", key: "target", name: "Target", aliases: ["Target"], color: null },
      removedTagId: "tag-source",
    });
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

  it("sends explicit empty parameters when listing tag suggestions", async () => {
    const invoke = vi.fn(async () => ["desktop"]);
    const client = new DaemonLocalTaskClient(invoke);

    await expect(client.listTags()).resolves.toEqual(["desktop"]);
    expect(invoke.mock.calls).toEqual([["localTask.listTags", {}]]);
  });

  it("rejects malformed tag suggestion arrays", async () => {
    const client = new DaemonLocalTaskClient(vi.fn(async () => ["valid", null]));

    await expect(client.listTags()).rejects.toThrow("invalid Local Task tag list payload");
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
    [
      "missing tags",
      (payload: typeof taskPayload) => {
        const { tags: _tags, ...taskWithoutTags } = payload;
        return taskWithoutTags;
      },
    ],
    ["null tags", (payload: typeof taskPayload) => ({ ...payload, tags: null })],
    ["non-string tag", (payload: typeof taskPayload) => ({ ...payload, tags: ["valid", 1] })],
  ])("rejects %s", async (_name, buildPayload) => {
    const client = new DaemonLocalTaskClient(vi.fn(async () => buildPayload(taskPayload)));

    await expect(client.get("task-1")).rejects.toThrow("invalid Local Task payload");
  });
});

it("strictly parses tag catalog entries", async () => {
  const validClient = new DaemonLocalTaskClient(
    vi.fn(async () => [
      { id: "tag-cafe", key: "café", name: "Café", aliases: ["CAFÉ", "Café"], color: "#14B8A6" },
      { id: "tag-plain", key: "plain", name: "Plain", aliases: ["Plain"], color: null },
    ]),
  );
  const malformedClient = new DaemonLocalTaskClient(
    vi.fn(async () => [{ id: "tag-key", key: "key", name: "Name", aliases: ["Name"], color: "orange" }]),
  );
  const missingAliasesClient = new DaemonLocalTaskClient(
    vi.fn(async () => [{ id: "tag-key", key: "key", name: "Name", color: null }]),
  );
  const missingIDClient = new DaemonLocalTaskClient(
    vi.fn(async () => [{ key: "key", name: "Name", aliases: ["Name"], color: null }]),
  );

  await expect(validClient.listTagCatalog()).resolves.toEqual([
    { id: "tag-cafe", key: "café", name: "Café", aliases: ["CAFÉ", "Café"], color: "#14B8A6" },
    { id: "tag-plain", key: "plain", name: "Plain", aliases: ["Plain"], color: null },
  ]);
  await expect(malformedClient.listTagCatalog()).rejects.toThrow("invalid Local Task tag catalog payload");
  await expect(missingAliasesClient.listTagCatalog()).rejects.toThrow("invalid Local Task tag catalog payload");
  await expect(missingIDClient.listTagCatalog()).rejects.toThrow("invalid Local Task tag catalog payload");
});

describe("stable tag ID mutations", () => {
  it("does not fall back to creating a tag when a stale color ID is rejected", async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === "localTask.updateTagColor") throw new Error("tag not found");
      return taskPayload;
    });
    const client = new DaemonLocalTaskClient(invoke);

    await expect(client.updateTagColor("stale-tag-id", "#3B82F6")).rejects.toThrow("tag not found");
    expect(invoke.mock.calls).toEqual([["localTask.updateTagColor", { id: "stale-tag-id", color: "#3B82F6" }]]);
  });
});
