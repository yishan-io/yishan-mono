import { createProjectBodySchema } from "@/validation/project";
import { describe, expect, it } from "vitest";

describe("createProjectBodySchema", () => {
  it("accepts a local path with sourceTypeHint unknown (non-git project)", () => {
    const result = createProjectBodySchema.safeParse({
      name: "Plain Folder",
      sourceTypeHint: "unknown",
      localPath: "/tmp/plain-folder",
    });

    expect(result.success).toBe(true);
  });

  it("still accepts git and git-local local paths", () => {
    expect(
      createProjectBodySchema.safeParse({
        name: "Repo",
        sourceTypeHint: "git-local",
        localPath: "/tmp/repo",
      }).success,
    ).toBe(true);
    expect(
      createProjectBodySchema.safeParse({
        name: "Remote",
        sourceTypeHint: "git",
        repoUrl: "https://github.com/acme/repo.git",
      }).success,
    ).toBe(true);
  });

  it("rejects a local path without a name", () => {
    const result = createProjectBodySchema.safeParse({
      sourceTypeHint: "unknown",
      localPath: "/tmp/plain-folder",
    });

    expect(result.success).toBe(false);
  });
});
