import { describe, expect, it } from "vitest";
import type { GitPullRequest } from "./gitPullRequestTypes";
import { livePrStatus } from "./pullRequestUtils";

function buildPr(overrides: Partial<GitPullRequest> = {}): GitPullRequest {
  return {
    id: "pr-1",
    title: "Fix everything",
    url: "https://github.com/yishan-io/yishan-mono/pull/1",
    branch: "feature/x",
    baseBranch: "main",
    state: "open",
    status: "open",
    isDraft: false,
    complete: false,
    ...overrides,
  } as GitPullRequest;
}

describe("livePrStatus (rename candidate after P30)", () => {
  it("returns merged for completed or merged pull requests", () => {
    expect(livePrStatus(buildPr({ complete: true }))).toBe("merged");
    expect(livePrStatus(buildPr({ status: "merged" }))).toBe("merged");
    expect(livePrStatus(buildPr({ status: "MERGED" }))).toBe("merged");
  });

  it("returns draft for draft or draft-status pull requests", () => {
    expect(livePrStatus(buildPr({ isDraft: true }))).toBe("draft");
    expect(livePrStatus(buildPr({ status: "draft" }))).toBe("draft");
  });

  it("returns closed for closed pull requests", () => {
    expect(livePrStatus(buildPr({ status: "closed" }))).toBe("closed");
  });

  it("returns approved for approved review decisions", () => {
    expect(livePrStatus(buildPr({ reviewDecision: "approved" }))).toBe("approved");
    expect(livePrStatus(buildPr({ reviewDecision: "APPROVED" }))).toBe("approved");
  });

  it("returns open by default", () => {
    expect(livePrStatus(buildPr())).toBe("open");
    expect(livePrStatus(buildPr({ status: "", reviewDecision: "" }))).toBe("open");
  });

  it("gives merged precedence over draft and closed", () => {
    expect(livePrStatus(buildPr({ complete: true, isDraft: true, status: "closed" }))).toBe("merged");
  });

  it("gives draft precedence over closed", () => {
    expect(livePrStatus(buildPr({ isDraft: true, status: "closed" }))).toBe("draft");
  });
});
