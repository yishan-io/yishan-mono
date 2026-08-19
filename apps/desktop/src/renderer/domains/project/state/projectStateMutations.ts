import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import { projectStore } from "./projectStore";

/**
 * Project semantic State mutations (desktop8 Phase 33). Each function is the
 * authoritative public State operation for Project data; the raw project Store
 * stays internal to the Domain.
 */
export function setDisplayProjectIds(projectIds: string[]): void {
  projectStore.getState().setDisplayProjectIds(projectIds);
}

export function setLastUsedExternalAppId(appId: ExternalAppId): void {
  projectStore.getState().setLastUsedExternalAppId(appId);
}

/** Sets the workspace list hierarchy mode (by project or by node). */
export function setWorkspaceListHierarchyMode(mode: "by_project" | "by_node"): void {
  projectStore.getState().setWorkspaceListHierarchyMode(mode);
}
