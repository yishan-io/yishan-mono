/**
 * Project Domain public API (Domains plan D6).
 *
 * Exports the stable command surface, project models, the public State
 * surfaces (selectors + actions), the read Store, and the read-only React
 * hooks. Cross-Domain code imports project through this file only.
 */
export { LOCAL_FOLDER_PROJECT_ID } from "./model/projectTypes";
export { isGitProject, supportsGitFeatures } from "./model/projectGitCapability";
export { filterVisibleProjects } from "./model/projectListRules";
export type {
  WorkspaceProjectCommand,
  WorkspaceProjectRecord,
  WorkspaceStoreOrganizationPreference,
} from "./model/projectTypes";
export {
  createProject,
  deleteProject,
  inspectLocalProjectSource,
  updateProjectConfig,
} from "./commands/projectCommands";
export { getDefaultWorktreeLocation, openLocalFolderDialog } from "./infrastructure/projectHostCommands";
export {
  selectLastUsedExternalAppId,
  selectProjectById,
  selectProjectDisplayIds,
  selectProjectLastUsedExternalAppIdFromState,
  selectProjects,
  selectWorkspaceListHierarchyMode,
} from "./state/projectSelectors";
export {
  setDisplayProjectIds,
  setLastUsedExternalAppId,
  setWorkspaceListHierarchyMode,
} from "./state/projectActions";
export { projectStore } from "./state/projectStore";
export { useProjectLastUsedExternalAppId } from "./hooks/useProjectLastUsedExternalAppId";
export {
  useDisplayProjectIds,
  useLastUsedExternalAppId,
  useProjects,
  useWorkspaceListHierarchyMode,
} from "./hooks/useProjectReadHooks";

// Stable UI entry points for cross-feature composition (Phase 18).
export { CreateProjectDialogView } from "./features/create-project/CreateProjectDialogView";
export { CreateProjectFormView } from "./features/create-project/CreateProjectFormView";
export { ProjectConfigDialogView } from "./features/project-config/ProjectConfigDialogView";
export { ProjectDeleteDialogView } from "./features/project-delete/ProjectDeleteDialogView";
export { ProjectFilterPopoverView } from "./features/project-list/ProjectFilterPopoverView";
export { ProjectListMenus } from "./features/project-list/ProjectListMenus";
export { ProjectListView } from "./features/project-list/ProjectListView";
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
