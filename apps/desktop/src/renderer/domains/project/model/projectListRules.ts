/** Pure display rules for the project list. */

/** Returns projects that are currently visible in UI order, based on `displayProjectIds`. */
export function filterVisibleProjects<T extends { id: string }>(projects: T[], displayProjectIds: string[]): T[] {
  return projects.filter((project) => displayProjectIds.includes(project.id));
}
