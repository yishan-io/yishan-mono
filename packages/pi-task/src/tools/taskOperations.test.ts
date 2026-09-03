import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalTaskRPCError } from "../backend/localTaskRpcClient";
import type { LocalTask, LocalTaskSearchResult } from "../backend/localTaskTypes";

import { buildDescription, createLocalTaskOperations } from "./taskOperations";

const globalTask = createTask({ id: "550e8400-e29b-41d4-a716-446655440000", status: "new" });
const projectTask = createTask({
  id: "imported/task-id",
  projectId: "project-a",
  title: "Project task",
  status: "new",
});

beforeEach(() => vi.stubEnv("YISHAN_PROJECT_ID", ""));
afterEach(() => vi.unstubAllEnvs());

describe("LocalTaskOperations", () => {
  it("starts a new task with separate goal, context, and acceptance-criteria sections", async () => {
    const client = createClient({ create: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(
      operations.start({
        title: "Task",
        goal: "Ship it",
        context: "The release blocks customer onboarding.",
        acceptanceCriteria: ["Tests pass", "Lint passes"],
      }),
    ).resolves.toMatchObject({ status: "new" });
    expect(client.create).toHaveBeenCalledWith({
      title: "Task",
      description:
        "## Goal\n\nShip it\n\n## Context\n\nThe release blocks customer onboarding.\n\n## Acceptance Criteria\n\n- Tests pass\n- Lint passes",
      priority: undefined,
      tags: undefined,
      projectId: "project-a",
    });

    await expect(operations.start({ title: "Task", description: "Direct", goal: "Ambiguous" })).rejects.toThrow(
      "Provide description or goal/context/acceptanceCriteria",
    );
  });

  it("links a newly created task to its requested workspace", async () => {
    const client = createClient({ create: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(operations.start({ title: "Task", workspaceId: "workspace-1" })).resolves.toEqual(projectTask);
    expect(client.linkWorkspace).toHaveBeenCalledWith("imported/task-id", "workspace-1");
  });

  it("reports the created task and requested workspace when workspace linking fails", async () => {
    const client = createClient({ create: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");
    const linkError = new Error("Workspace is unavailable.");
    client.linkWorkspace.mockRejectedValueOnce(linkError);

    let error: unknown;
    try {
      await operations.start({ title: "Task", workspaceId: "workspace-1" });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(client.create).toHaveBeenCalledOnce();
    expect(client.linkWorkspace).toHaveBeenCalledWith("imported/task-id", "workspace-1");
    expect(error).toMatchObject({
      message: "Task imported/task-id was created but could not be linked to requested workspace workspace-1.",
      cause: linkError,
    });
  });

  it("reads daemon-generated and imported opaque IDs when search fails", async () => {
    const client = createClient({ get: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");
    client.search.mockRejectedValueOnce(new Error("Search timed out."));

    await expect(operations.get("imported/task-id")).resolves.toEqual(projectTask);
    expect(client.get).toHaveBeenCalledWith("imported/task-id");
    expect(client.search).not.toHaveBeenCalled();
  });

  it("resolves an exact task key within project and global scope after an ID miss", async () => {
    const duplicateProjectTask = createTask({ ...projectTask, id: "project-task", key: "TASK-438" });
    const duplicateGlobalTask = createTask({ ...globalTask, id: "global-task", key: "TASK-438" });
    const client = createClient({ search: [searchResult(duplicateProjectTask), searchResult(duplicateGlobalTask)] });
    client.get.mockRejectedValue(new LocalTaskRPCError(-32004, "local task not found"));

    await expect(createLocalTaskOperations(client, "project-a").get("TASK-438")).resolves.toEqual(duplicateProjectTask);
    expect(client.search).toHaveBeenLastCalledWith("TASK-438", { projectId: "project-a" });
    await expect(createLocalTaskOperations(client).get("TASK-438")).resolves.toEqual(duplicateGlobalTask);
    expect(client.search).toHaveBeenLastCalledWith("TASK-438", {});
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it("does not search when direct ID lookup fails for a reason other than not found", async () => {
    const client = createClient();
    const operations = createLocalTaskOperations(client, "project-a");
    const getError = new Error("Local Task RPC connection failed");
    client.get.mockRejectedValueOnce(getError);

    await expect(operations.get("imported/task-id")).rejects.toBe(getError);
    expect(client.search).not.toHaveBeenCalled();
  });

  it("sends project filters and rejects cross-project get and update IDs", async () => {
    const client = createClient({ get: globalTask, list: [projectTask], search: [searchResult(projectTask)] });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(operations.list({ status: "new", tags: ["tag"] })).resolves.toEqual([projectTask]);
    expect(client.list).toHaveBeenCalledWith({ projectId: "project-a", status: "new", tags: ["tag"] });
    await expect(operations.search({ query: "project" })).resolves.toEqual([searchResult(projectTask)]);
    expect(client.search).toHaveBeenCalledWith("project", { projectId: "project-a" });
    await expect(operations.get(globalTask.id)).rejects.toThrow("configured project scope");
    await expect(operations.update(globalTask.id, { title: "No" })).rejects.toThrow("configured project scope");
    expect(client.update).not.toHaveBeenCalled();
  });

  it("omits the global project filter and filters mixed list/search arrays locally", async () => {
    const client = createClient({
      list: [globalTask, projectTask],
      search: [searchResult(globalTask), searchResult(projectTask)],
    });
    const operations = createLocalTaskOperations(client);

    await expect(operations.list()).resolves.toEqual([globalTask]);
    expect(client.list).toHaveBeenCalledWith({});
    await expect(operations.search({ query: "task", tags: ["tag"] })).resolves.toEqual([searchResult(globalTask)]);
    expect(client.search).toHaveBeenCalledWith("task", { tags: ["tag"] });
  });

  it("allows an empty description to clear it", async () => {
    const client = createClient({ get: projectTask, update: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await operations.update(projectTask.id, { description: "" });
    expect(client.update).toHaveBeenCalledWith(projectTask.id, { description: "" });
  });

  it("accepts 32-code-point astral tags across metadata RPCs", async () => {
    const astralTag = "😀".repeat(32);
    const client = createClient({ create: projectTask, get: projectTask, update: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await operations.start({ title: "Task", tags: [astralTag] });
    await operations.list({ tags: [astralTag] });
    await operations.search({ query: "task", tags: [astralTag] });
    await operations.update(projectTask.id, { tags: [astralTag] });

    expect(client.create).toHaveBeenCalledWith(expect.objectContaining({ tags: [astralTag] }));
    expect(client.list).toHaveBeenCalledWith({ projectId: "project-a", tags: [astralTag] });
    expect(client.search).toHaveBeenCalledWith("task", { projectId: "project-a", tags: [astralTag] });
    expect(client.update).toHaveBeenCalledWith(projectTask.id, { tags: [astralTag] });
  });

  it("rejects invalid tags before any metadata RPC", async () => {
    const client = createClient({ get: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");
    const tooManyTags = Array.from({ length: 13 }, (_, index) => `tag-${index}`);
    const tooLongTag = "😀".repeat(33);

    await expect(operations.start({ title: "Task", tags: tooManyTags })).rejects.toThrow("at most 12 tags");
    await expect(operations.list({ tags: [tooLongTag] })).rejects.toThrow("Unicode code points");
    await expect(operations.search({ query: "task", tags: [tooLongTag] })).rejects.toThrow("Unicode code points");
    await expect(operations.update(projectTask.id, { tags: [tooLongTag] })).rejects.toThrow("Unicode code points");
    expect(client.create).not.toHaveBeenCalled();
    expect(client.list).not.toHaveBeenCalled();
    expect(client.search).not.toHaveBeenCalled();
    expect(client.get).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
  });

  it("updates title, description, new/progressing/cancelled status, priority, and tags but cannot mark done", async () => {
    const updatedTask = createTask({ ...projectTask, status: "cancelled", tags: ["new"] });
    const client = createClient({ get: projectTask, update: updatedTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(
      operations.update(projectTask.id, {
        title: "Updated",
        description: "Details",
        status: "cancelled",
        priority: "high",
        tags: ["new"],
      }),
    ).resolves.toEqual(updatedTask);
    expect(client.update).toHaveBeenCalledWith(projectTask.id, {
      title: "Updated",
      description: "Details",
      status: "cancelled",
      priority: "high",
      tags: ["new"],
    });
  });

  it.each(["new", "progressing", "cancelled"] as const)("allows %s status updates", async (status) => {
    const updatedTask = createTask({ ...projectTask, status });
    const client = createClient({ get: projectTask, update: updatedTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(operations.update(projectTask.id, { status })).resolves.toEqual(updatedTask);
    expect(client.update).toHaveBeenCalledWith(projectTask.id, { status });
  });

  it("rejects done status before calling the client", async () => {
    const client = createClient({ get: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(operations.update(projectTask.id, { status: "done" as never })).rejects.toThrow(
      "Task status must be new, progressing, or cancelled.",
    );
    expect(client.get).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
  });

  it("formats a synthetic brief and never creates legacy task files", async () => {
    const client = createClient();
    const operations = createLocalTaskOperations(client);

    expect(operations.formatBrief(globalTask)).toBe(`# Task

**ID:** 550e8400-e29b-41d4-a716-446655440000
**Project:** global
**Created:** 2026-08-23T00:00:00Z
**Updated:** 2026-08-23T00:00:00Z
**Status:** new
**Priority:** medium
**Tags:** tag

## Description

Description
`);
    expect(client.create).not.toHaveBeenCalled();
    expect(client.get).not.toHaveBeenCalled();
  });
});

describe("buildDescription", () => {
  it("allows direct descriptions and no optional brief fields", () => {
    expect(buildDescription({ description: "  Direct description  " })).toBe("Direct description");
    expect(buildDescription({})).toBe("");
    expect(() => buildDescription({ description: "", acceptanceCriteria: [] })).toThrow("not both");
  });
});

function createClient(
  overrides: Partial<{
    create: LocalTask;
    get: LocalTask;
    list: LocalTask[];
    search: LocalTaskSearchResult[];
    update: LocalTask;
  }> = {},
) {
  return {
    create: vi.fn().mockResolvedValue(overrides.create ?? globalTask),
    get: vi.fn().mockResolvedValue(overrides.get ?? globalTask),
    list: vi.fn().mockResolvedValue(overrides.list ?? []),
    search: vi.fn().mockResolvedValue(overrides.search ?? []),
    update: vi.fn().mockResolvedValue(overrides.update ?? globalTask),
    linkWorkspace: vi.fn(),
  };
}

function createTask(overrides: Partial<LocalTask> = {}): LocalTask {
  return {
    id: "task-id",
    projectId: null,
    title: "Task",
    description: "Description",
    status: "new",
    priority: "medium",
    createdAt: "2026-08-23T00:00:00Z",
    updatedAt: "2026-08-23T00:00:00Z",
    completedAt: null,
    hasActiveWorkspace: false,
    tags: ["tag"],
    tagRefs: [],
    ...overrides,
  };
}

function searchResult(task: LocalTask): LocalTaskSearchResult {
  return { ...task, rank: 1 };
}
