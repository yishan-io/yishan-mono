/**
 * Single gate deciding whether a project supports git-backed features
 * (worktrees, changes/PR panels, commit/push, branch operations).
 *
 * Non-git projects have `sourceType === "unknown"`. A missing/`null`
 * sourceType is treated as git-capable so legacy records without the field
 * keep today's behavior.
 */
export function supportsGitFeatures(sourceType?: string | null): boolean {
  return sourceType !== "unknown";
}

/** Convenience gate over a project record. */
export function isGitProject(project: { sourceType?: string | null } | null | undefined): boolean {
  return supportsGitFeatures(project?.sourceType);
}
