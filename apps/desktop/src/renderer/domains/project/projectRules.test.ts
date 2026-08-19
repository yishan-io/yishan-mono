import { describe, expect, it } from "vitest";
import { filterVisibleProjects, isGitProject, supportsGitFeatures } from "./projectRules";

describe("projectRules", () => {
  it("filters visible projects by display ids while preserving project order", () => {
    expect(
      filterVisibleProjects(
        [
          { id: "repo-1", name: "Repo 1" },
          { id: "repo-2", name: "Repo 2" },
          { id: "repo-3", name: "Repo 3" },
        ],
        ["repo-3", "repo-1"],
      ),
    ).toEqual([
      { id: "repo-1", name: "Repo 1" },
      { id: "repo-3", name: "Repo 3" },
    ]);
  });

  it("treats unknown sourceType as non-git and everything else as git-capable", () => {
    expect(supportsGitFeatures("unknown")).toBe(false);
    expect(supportsGitFeatures("git")).toBe(true);
    expect(supportsGitFeatures("git-local")).toBe(true);
    // Missing/null sourceType keeps legacy records git-capable.
    expect(supportsGitFeatures(undefined)).toBe(true);
    expect(supportsGitFeatures(null)).toBe(true);
  });

  it("gates git capability over a project record", () => {
    expect(isGitProject({ sourceType: "git" })).toBe(true);
    expect(isGitProject({ sourceType: "unknown" })).toBe(false);
    expect(isGitProject(null)).toBe(true);
    expect(isGitProject(undefined)).toBe(true);
  });
});
