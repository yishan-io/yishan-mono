import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import type { WorkspaceProjectRecord, WorkspaceStoreOrganizationPreference } from "../projectTypes";
import { projectStore } from "./projectStore";

/**
 * Project state reads — semantic getters for external non-React Consumers.
 *
 * Each getter returns a synchronous snapshot via `Store.getState()`. React
 * consumers subscribe through the hooks in `../hooks`; pure selectors (State
 * in, value out, no `getState()`) stay out of this file.
 */
export function getProjects(): WorkspaceProjectRecord[] {
  return projectStore.getState().projects;
}

export function getProjectById(projectId: string | undefined): WorkspaceProjectRecord | undefined {
  if (!projectId) {
    return undefined;
  }
  return projectStore.getState().projects.find((item) => item.id === projectId);
}

export function getProjectDisplayIds(): string[] {
  return projectStore.getState().displayProjectIds;
}

/** Reads the last-used external app id. */
export function getLastUsedExternalAppId(): ExternalAppId | undefined {
  return projectStore.getState().lastUsedExternalAppId;
}

/** Reads the organization-scoped project preferences (display/known ids, last app). */
export function getOrganizationPreferencesById(): Record<string, WorkspaceStoreOrganizationPreference> | undefined {
  return projectStore.getState().organizationPreferencesById;
}

/** Reads the workspace list hierarchy mode. */
export function getWorkspaceListHierarchyMode(): "by_project" | "by_node" {
  return projectStore.getState().workspaceListHierarchyMode;
}
