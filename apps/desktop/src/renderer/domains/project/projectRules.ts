/**
 * Project domain pure rules.
 *
 * Deterministic rules about the Project concept, named by business meaning:
 * the git-capability gate and the visible-list filter. Random default
 * selection (icons/colors) lives in `state/projectStore` beside the
 * create-project transition.
 */

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

/** Returns projects that are currently visible in UI order, based on `displayProjectIds`. */
export function filterVisibleProjects<T extends { id: string }>(projects: T[], displayProjectIds: string[]): T[] {
  return projects.filter((project) => displayProjectIds.includes(project.id));
}
