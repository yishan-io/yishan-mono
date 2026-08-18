import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import type { WorkspaceProjectRecord } from "../../../domains/project/model/projectTypes";
import type { ProjectStoreState } from "./projectStore";
import { projectStore } from "./projectStore";

/**
 * Project feature selectors — the public read surface for Project State
 * (Phase 12, desktop5.md). Cross-feature code reads project state through
 * these functions instead of importing the project Store directly.
 */
export function selectProjects(): WorkspaceProjectRecord[] {
  return projectStore.getState().projects;
}

export function selectProjectById(projectId: string | undefined): WorkspaceProjectRecord | undefined {
  if (!projectId) {
    return undefined;
  }
  return projectStore.getState().projects.find((item) => item.id === projectId);
}

export function selectProjectDisplayIds(): string[] {
  return projectStore.getState().displayProjectIds;
}

/** State-only selector for zustand subscriptions (see useProjectLastUsedExternalAppId). */
export function selectProjectLastUsedExternalAppIdFromState(state: ProjectStoreState): ExternalAppId | undefined {
  return state.lastUsedExternalAppId;
}

/** Reads the last-used external app id. */
export function selectLastUsedExternalAppId(): ExternalAppId | undefined {
  return projectStore.getState().lastUsedExternalAppId;
}

/** Reads the workspace list hierarchy mode. */
export function selectWorkspaceListHierarchyMode(): "by_project" | "by_node" {
  return projectStore.getState().workspaceListHierarchyMode;
}
