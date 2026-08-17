/**
 * Git branch prefix rules — pure Settings domain logic (Phase 17, desktop6.md).
 * The branch prefix mode and its resolution rules have no store dependency.
 */

export type GitBranchPrefixMode = "none" | "user" | "custom";

export const DEFAULT_GIT_BRANCH_PREFIX_MODE: GitBranchPrefixMode = "none";

/** Normalizes one free-text value into one git-safe branch segment. */
export function normalizeGitBranchPrefixSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}

/** Resolves one branch prefix segment from current prefix settings and git author. */
export function resolveGitBranchPrefix(input: {
  prefixMode: GitBranchPrefixMode;
  customPrefix: string;
  gitUserName: string;
}): string {
  if (input.prefixMode === "none") {
    return "";
  }
  if (input.prefixMode === "user") {
    return normalizeGitBranchPrefixSegment(input.gitUserName);
  }
  return normalizeGitBranchPrefixSegment(input.customPrefix);
}
