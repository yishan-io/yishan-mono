/**
 * Project Domain public API (Domains plan D6).
 *
 * Exports the stable command surface, project models, the public State
 * surface (selectors + mutations), and the read-only React hooks. The raw
 * project Store stays internal; cross-Domain code imports project through
 * this file only.
 */
export { filterVisibleProjects, isGitProject, supportsGitFeatures } from "./projectRules";
export type {
  WorkspaceProjectCommand,
  WorkspaceProjectRecord,
  WorkspaceStoreOrganizationPreference,
} from "./projectTypes";
export {
  createProject,
  deleteProject,
  inspectLocalProjectSource,
  updateProjectConfig,
} from "./commands/projectCommands";
export {
  getProjectListPreferences,
  listProjectsByOrg,
  setProjectListPreferences,
} from "./daemon/projectDaemonClient";
export { getDefaultWorktreeLocation } from "./daemon/projectDaemonClient";
export { openLocalFolderDialog } from "./host/folderPicker";
export type {
  ProjectListModePreference,
  ProjectListPreference,
} from "./daemon/projectDaemonClient";
export {
  getLastUsedExternalAppId,
  getOrganizationPreferencesById,
  getProjectById,
  getProjectDisplayIds,
  getProjects,
  getWorkspaceListHierarchyMode,
} from "./state/projectStateReads";
export {
  loadProjects,
  setDisplayProjectIds,
  setLastUsedExternalAppId,
  setWorkspaceListHierarchyMode,
} from "./state/projectStateMutations";
export { useProjectLastUsedExternalAppId } from "./hooks/useProjectLastUsedExternalAppId";
export {
  useDisplayProjectIds,
  useIsProjectsLoaded,
  useLastUsedExternalAppId,
  useProjects,
  useWorkspaceListHierarchyMode,
} from "./hooks/useProjectReadHooks";

// Stable UI entry points for cross-feature composition (Phase 18).
// The combined Project/Node/Workspace navigator moved to
// `app/features/project-workspace-navigator` (desktop7 Phase 24); Project keeps its
// list rules, read surface, and the project-config/delete dialogs.
export { CreateProjectDialogView } from "./features/create-project/CreateProjectDialogView";
export { CreateProjectFormView } from "./features/create-project/CreateProjectFormView";
export { SYSTEM_FILE_MANAGER_APP_ID, type ExternalAppId } from "@shared/contracts/externalApps";

export { ProjectConfigDialogView } from "./features/project-config/ProjectConfigDialogView";
export { ProjectDeleteDialogView } from "./features/project-delete/ProjectDeleteDialogView";
export { useProjectDeletionFlow } from "./features/project-delete/useProjectDeletionFlow";
export { renderProjectIcon } from "./ui/projectIcons";
export {
  DEFAULT_PROJECT_ICON_ID,
  PROJECT_COLOR_PRESETS,
  PROJECT_ICON_OPTIONS,
  REPO_ICON_OPTIONS,
  findProjectIconOption,
} from "./ui/projectIcons";
