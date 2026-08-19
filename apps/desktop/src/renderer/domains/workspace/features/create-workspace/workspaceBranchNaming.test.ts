import { describe, expect, it } from "vitest";
import {
  isPrefixOnlyBranchName,
  resolveSourceBranchState,
  resolveTargetBranchForCreate,
  suggestTargetBranchName,
  toBranchName,
} from "./workspaceBranchNaming";

describe("workspaceBranchNaming", () => {
  it("prefers main when available", () => {
    expect(resolveSourceBranchState(["feature/a", "master", "main"], "develop")).toEqual({
      options: ["feature/a", "master", "main"],
      preferred: "main",
    });
  });

  it("falls back to master when repo default is master and branch list is empty", () => {
    expect(resolveSourceBranchState([], "master")).toEqual({
      options: ["master"],
      preferred: "master",
    });
  });

  it("falls back to repo default branch when branch list is empty", () => {
    expect(resolveSourceBranchState([], "develop")).toEqual({
      options: ["develop"],
      preferred: "develop",
    });
  });

  it("normalizes branch names", () => {
    expect(toBranchName("  Team Core/Fix Login Timeout  ")).toBe("team-core/fix-login-timeout");
  });

  it("builds suggested branch from prefix and workspace name", () => {
    expect(suggestTargetBranchName("Fix Login Timeout", "team-core/")).toBe("team-core/fix-login-timeout");
  });

  it("detects prefix-only branch input", () => {
    expect(isPrefixOnlyBranchName("team-core/", "team-core/")).toBe(true);
    expect(isPrefixOnlyBranchName("team-core", "team-core/")).toBe(true);
    expect(isPrefixOnlyBranchName("team-core/fix", "team-core/")).toBe(false);
  });

  it("keeps manual non-prefix branch input", () => {
    expect(
      resolveTargetBranchForCreate({
        workspaceName: "Fix Login Timeout",
        branchInput: "team-core/manual-branch",
        branchPrefix: "team-core/",
      }),
    ).toBe("team-core/manual-branch");
  });

  it("derives branch from workspace name when input is empty or prefix-only", () => {
    expect(
      resolveTargetBranchForCreate({
        workspaceName: "Fix Login Timeout",
        branchInput: "",
        branchPrefix: "team-core/",
      }),
    ).toBe("team-core/fix-login-timeout");

    expect(
      resolveTargetBranchForCreate({
        workspaceName: "Fix Login Timeout",
        branchInput: "team-core/",
        branchPrefix: "team-core/",
      }),
    ).toBe("team-core/fix-login-timeout");
  });
});
