import { describe, expect, it } from "vitest";

import { resolveWorkspaceCreateSourceBranchSections } from "./workspace-create-source-branch-selector-domain";

describe("workspace-create-source-branch-selector-domain", () => {
  it("returns non-empty sections in local, worktree, remote order", () => {
    const sections = resolveWorkspaceCreateSourceBranchSections(
      {
        localBranches: ["main", "feature/a"],
        remoteBranches: ["origin/main"],
        worktreeBranches: ["wt/feature"],
      },
      {
        localBranches: "Local",
        remoteBranches: "Remote",
        worktreeBranches: "Worktree",
      },
    );

    expect(sections).toEqual([
      {
        branches: ["main", "feature/a"],
        key: "localBranches",
        label: "Local",
      },
      {
        branches: ["wt/feature"],
        key: "worktreeBranches",
        label: "Worktree",
      },
      {
        branches: ["origin/main"],
        key: "remoteBranches",
        label: "Remote",
      },
    ]);
  });

  it("omits empty sections", () => {
    const sections = resolveWorkspaceCreateSourceBranchSections(
      {
        localBranches: [],
        remoteBranches: ["origin/main"],
        worktreeBranches: [],
      },
      {
        localBranches: "Local",
        remoteBranches: "Remote",
        worktreeBranches: "Worktree",
      },
    );

    expect(sections).toEqual([
      {
        branches: ["origin/main"],
        key: "remoteBranches",
        label: "Remote",
      },
    ]);
  });
});
