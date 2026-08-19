import { describe, expect, it } from "vitest";
import { countWorkspaceGitChanges } from "./gitChangeSummary";

describe("gitChangeSummary", () => {
  it("counts changes across staged, unstaged, and untracked sections", () => {
    expect(
      countWorkspaceGitChanges({
        staged: [{ path: "a.ts" }],
        unstaged: [{ path: "b.ts" }, { path: "c.ts" }],
        untracked: [{ path: "d.ts" }],
      }),
    ).toBe(4);
  });
});
