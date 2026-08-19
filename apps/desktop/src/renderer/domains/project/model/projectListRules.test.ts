import { describe, expect, it } from "vitest";
import { filterVisibleProjects } from "./projectListRules";

describe("projectListRules", () => {
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
});
