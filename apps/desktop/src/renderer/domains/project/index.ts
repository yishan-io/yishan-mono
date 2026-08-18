/**
 * Project feature public API (Phase 12, desktop5.md).
 *
 * Exports the stable command surface, project models, and the public State
 * surfaces (selectors + actions). The Project Store itself is internal.
 */
export type { ProjectCommands } from "./commands/contract";
export { LOCAL_FOLDER_PROJECT_ID } from "./model/projectTypes";
export type {
  WorkspaceProjectCommand,
  WorkspaceProjectRecord,
  WorkspaceStoreOrganizationPreference,
} from "./model/projectTypes";
export {
  selectProjectById,
  selectProjectDisplayIds,
  selectProjectLastUsedExternalAppIdFromState,
  selectProjects,
} from "./state/projectSelectors";
export { setDisplayProjectIds, setLastUsedExternalAppId } from "./state/projectActions";
export { useProjectLastUsedExternalAppId } from "./ui/hooks/useProjectLastUsedExternalAppId";

// Stable UI entry points for cross-feature composition (Phase 18).
export { CreateProjectDialogView } from "./ui/CreateProjectDialogView";
export { CreateProjectFormView } from "./ui/CreateProjectFormView";
export { ProjectConfigDialogView } from "./ui/ProjectConfigDialogView";
export { ProjectDeleteDialogView } from "./ui/ProjectDeleteDialogView";
export { ProjectFilterPopoverView } from "./ui/ProjectFilterPopoverView";
export { ProjectListMenus } from "./ui/ProjectListMenus";
export { ProjectListView } from "./ui/ProjectListView";
export { useDisplayProjectIds, useProjects, useLastUsedExternalAppId } from "./ui/hooks/useProjectReadHooks";
export { renderProjectIcon } from "./ui/projectIcons";
export {
  DEFAULT_PROJECT_ICON_ID,
  PROJECT_COLOR_PRESETS,
  PROJECT_ICON_OPTIONS,
  REPO_ICON_OPTIONS,
  findProjectIconOption,
  pickRandomProjectColor,
  pickRandomProjectIcon,
} from "./ui/projectIcons";
