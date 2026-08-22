import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalTask, LocalTaskSearchResult } from "../backend/localTaskTypes";

import { buildDescription, createLocalTaskOperations } from "./taskOperations";

const globalTask = createTask({ id: "550e8400-e29b-41d4-a716-446655440000" });
const projectTask = createTask({ id: "imported/task-id", projectId: "project-a", title: "Project task" });

beforeEach(() => vi.stubEnv("YISHAN_PROJECT_ID", ""));
afterEach(() => vi.unstubAllEnvs());

describe("LocalTaskOperations", () => {
  it("maps description or goal/criteria exactly when starting a scoped task", async () => {
    const client = createClient({ create: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(
      operations.start({ title: "Task", goal: "Ship it", acceptanceCriteria: ["Tests pass", "Lint passes"] }),
    ).resolves.toEqual(projectTask);
    expect(client.create).toHaveBeenCalledWith({
      title: "Task",
      description: "Ship it\n\n## Acceptance Criteria\n\n- Tests pass\n- Lint passes",
      priority: undefined,
      tags: undefined,
      projectId: "project-a",
    });

    await expect(operations.start({ title: "Task", description: "Direct", goal: "Ambiguous" })).rejects.toThrow(
      "Provide description or goal/acceptanceCriteria",
    );
  });

  it("uses daemon-generated and imported opaque IDs without imposing an ID pattern", async () => {
    const client = createClient({ get: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(operations.get("imported/task-id")).resolves.toEqual(projectTask);
    expect(client.get).toHaveBeenCalledWith("imported/task-id");
  });

  it("sends project filters and rejects cross-project get and update IDs", async () => {
    const client = createClient({ get: globalTask, list: [projectTask], search: [searchResult(projectTask)] });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(operations.list({ status: "active", tags: ["tag"] })).resolves.toEqual([projectTask]);
    expect(client.list).toHaveBeenCalledWith({ projectId: "project-a", status: "active", tags: ["tag"] });
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

  it("updates title, description, active/paused status, priority, and tags but cannot complete", async () => {
    const updatedTask = createTask({ ...projectTask, status: "paused", tags: ["new"] });
    const client = createClient({ get: projectTask, update: updatedTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(
      operations.update(projectTask.id, {
        title: "Updated",
        description: "Details",
        status: "paused",
        priority: "high",
        tags: ["new"],
      }),
    ).resolves.toEqual(updatedTask);
    expect(client.update).toHaveBeenCalledWith(projectTask.id, {
      title: "Updated",
      description: "Details",
      status: "paused",
      priority: "high",
      tags: ["new"],
    });
  });

  it("rejects completed status before calling the client", async () => {
    const client = createClient({ get: projectTask });
    const operations = createLocalTaskOperations(client, "project-a");

    await expect(operations.update(projectTask.id, { status: "completed" as never })).rejects.toThrow(
      "Task status must be active or paused.",
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
**Status:** active
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
  };
}

function createTask(overrides: Partial<LocalTask> = {}): LocalTask {
  return {
    id: "task-id",
    projectId: null,
    title: "Task",
    description: "Description",
    status: "active",
    priority: "medium",
    createdAt: "2026-08-23T00:00:00Z",
    updatedAt: "2026-08-23T00:00:00Z",
    completedAt: null,
    tags: ["tag"],
    ...overrides,
  };
}

function searchResult(task: LocalTask): LocalTaskSearchResult {
  return { ...task, rank: 1 };
}
