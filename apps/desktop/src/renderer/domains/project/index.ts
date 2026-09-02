/**
 * Project Domain public API (Domains plan D6).
 *
 * Exports the stable command surface, project models, and the project Store
 * as the public State API. External code reads with `projectStore.getState()`,
 * subscribes with `projectStore(selector)`, and calls public actions with
 * `projectStore.getState().action()` — imported from this file only.
 */
export { filterVisibleProjects, supportsGitFeatures } from "./projectRules";
export type {
  WorkspaceProjectCommand,
  WorkspaceProjectRecord,
  WorkspaceStoreOrganizationPreference,
} from "./projectTypes";
export {
  createProject,
  deleteProject,
  ensureProjectTaskPrefix,
  recordLastUsedExternalApp,
  updateProjectConfig,
} from "./commands/projectCommands";
export { getProjectListPreferences, listProjectsByOrg, setProjectListPreferences } from "./daemon/projectDaemonClient";
export { getDefaultWorktreeLocation } from "./daemon/projectDaemonClient";
export { openLocalFolderDialog } from "./host/folderPicker";
export type {
  ProjectListModePreference,
  ProjectListPreference,
} from "./daemon/projectDaemonClient";
export type { ProjectRecord, ProjectWithWorkspacesRecord } from "./api/types";
export { projectStore, type ProjectStoreState } from "./state/projectStore";

// Stable UI entry points for cross-feature composition.
// The combined Project/Node/Workspace navigator moved to
// `app/features/project-workspace-navigator`; Project keeps its
// list rules, read surface, and the project-config/delete dialogs.
export { CreateProjectDialogView } from "./features/create-project/CreateProjectDialogView";
export { CreateProjectFormView } from "./features/create-project/CreateProjectFormView";
export { SYSTEM_FILE_MANAGER_APP_ID, type ExternalAppId } from "@shared/contracts/externalApps";

export { ProjectConfigDialogView } from "./features/project-config/ProjectConfigDialogView";
export { ProjectDeleteDialogView } from "./features/project-delete/ProjectDeleteDialogView";
export { useProjectDeletionFlow } from "./features/project-delete/useProjectDeletionFlow";
export { renderProjectIcon } from "./ui/projectIcons";
