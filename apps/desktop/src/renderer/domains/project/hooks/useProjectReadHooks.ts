import type { WorkspaceProjectRecord } from "../projectTypes";
import { projectStore } from "../state/projectStore";

/**
 * Project feature read-only hooks — the stable read surface for Project State
 * (Phase 17, desktop6.md). Cross-feature UI subscribes to project state
 * through these hooks instead of importing the Project Store directly.
 */

/** Subscribes to the project list. */
export function useProjects(): WorkspaceProjectRecord[] {
  return projectStore((state) => state.projects);
}

/** Subscribes to the projects-loaded flag. */
export function useIsProjectsLoaded(): boolean {
  return projectStore((state) => state.isProjectsLoaded);
}

/** Subscribes to the visible project id list. */
export function useDisplayProjectIds(): string[] {
  return projectStore((state) => state.displayProjectIds) ?? [];
}

/** Subscribes to the last-used external app id. */
export function useLastUsedExternalAppId() {
  return projectStore((state) => state.lastUsedExternalAppId);
}

/** Subscribes to the workspace list hierarchy mode. */
export function useWorkspaceListHierarchyMode(): "by_project" | "by_node" {
  return projectStore((state) => state.workspaceListHierarchyMode);
}
