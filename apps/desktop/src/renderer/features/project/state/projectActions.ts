import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import { projectStore } from "./projectStore";

/**
 * Project feature state actions — the public state-change surface for Project
 * State (Phase 12, desktop5.md). Cross-feature commands apply project state
 * changes through these functions instead of importing the project Store.
 */
export function setDisplayProjectIds(projectIds: string[]): void {
  projectStore.getState().setDisplayProjectIds(projectIds);
}

export function setLastUsedExternalAppId(appId: ExternalAppId): void {
  projectStore.getState().setLastUsedExternalAppId(appId);
}
