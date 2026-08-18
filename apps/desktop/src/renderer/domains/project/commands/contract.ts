/**
 * ProjectCommands — the public command surface for the Project feature.
 *
 * Phase 1 contract; now lives in the feature command directory (Phase 4).
 */
import type * as projectCommands from "./projectCommands";

export type ProjectCommands = {
  inspectLocalProjectSource: typeof projectCommands.inspectLocalProjectSource;
  loadWorkspaceSnapshot: typeof projectCommands.loadWorkspaceSnapshot;
  createProject: typeof projectCommands.createProject;
  deleteProject: typeof projectCommands.deleteProject;
  updateProjectConfig: typeof projectCommands.updateProjectConfig;
  getProjectListPreferences: typeof projectCommands.getProjectListPreferences;
  setProjectListPreferences: typeof projectCommands.setProjectListPreferences;
};
