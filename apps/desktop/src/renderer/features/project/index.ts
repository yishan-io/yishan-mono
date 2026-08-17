/**
 * Project feature public API (Phase 12, desktop5.md).
 *
 * Exports the stable command surface, project models, and the public State
 * surfaces (selectors + actions). The Project Store itself is internal.
 */
export type { ProjectCommands } from "./commands/contract";
export { LOCAL_FOLDER_PROJECT_ID } from "./model/projectTypes";
export type { WorkspaceProjectCommand, WorkspaceProjectRecord, WorkspaceStoreOrganizationPreference } from "./model/projectTypes";
export {
  selectProjectById,
  selectProjectDisplayIds,
  selectProjectLastUsedExternalAppIdFromState,
  selectProjects,
} from "./state/projectSelectors";
export { setDisplayProjectIds, setLastUsedExternalAppId } from "./state/projectActions";
export { useProjectLastUsedExternalAppId } from "./ui/hooks/useProjectLastUsedExternalAppId";
