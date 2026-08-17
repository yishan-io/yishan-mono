import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import type { WorkspaceProjectRecord } from "../../../features/workbench/model/types";
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
export function selectProjectLastUsedExternalAppIdFromState(
  state: ProjectStoreState,
): ExternalAppId | undefined {
  return state.lastUsedExternalAppId;
}
