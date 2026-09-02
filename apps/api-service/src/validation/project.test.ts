import { createProjectBodySchema, updateProjectBodySchema } from "@/validation/project";
import { describe, expect, it } from "vitest";

describe("createProjectBodySchema", () => {
  it("accepts a local path with sourceTypeHint unknown (non-git project)", () => {
    const result = createProjectBodySchema.safeParse({
      name: "Plain Folder",
      taskPrefix: "PLAI",
      sourceTypeHint: "unknown",
      localPath: "/tmp/plain-folder",
    });

    expect(result.success).toBe(true);
  });

  it("still accepts git and git-local local paths", () => {
    expect(
      createProjectBodySchema.safeParse({
        name: "Repo",
        taskPrefix: "REPO",
        sourceTypeHint: "git-local",
        localPath: "/tmp/repo",
      }).success,
    ).toBe(true);
    expect(
      createProjectBodySchema.safeParse({
        name: "Remote",
        taskPrefix: "REMO",
        sourceTypeHint: "git",
        repoUrl: "https://github.com/acme/repo.git",
      }).success,
    ).toBe(true);
  });

  it.each(["AB", "abcdef", "Abc", "PERS", "ABC1"])("rejects an invalid task prefix %s", (taskPrefix) => {
    expect(createProjectBodySchema.safeParse({ name: "Project", taskPrefix }).success).toBe(false);
  });

  it("rejects a local path without a name", () => {
    const result = createProjectBodySchema.safeParse({
      sourceTypeHint: "unknown",
      localPath: "/tmp/plain-folder",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateProjectBodySchema", () => {
  it("rejects taskPrefix so project prefixes cannot change after creation", () => {
    expect(updateProjectBodySchema.safeParse({ taskPrefix: "NEW" }).success).toBe(false);
  });
});

import { allocateLocalTaskKeyBodySchema } from "@/validation/project";

describe("allocateLocalTaskKeyBodySchema", () => {
  it("requires a non-empty local task ID and rejects scope fields", () => {
    expect(allocateLocalTaskKeyBodySchema.safeParse({ localTaskId: "task-1" }).success).toBe(true);
    expect(allocateLocalTaskKeyBodySchema.safeParse({ localTaskId: "" }).success).toBe(false);
    expect(allocateLocalTaskKeyBodySchema.safeParse({ localTaskId: "task-1", userId: "user-2" }).success).toBe(false);
  });
});
