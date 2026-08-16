/**
 * ProjectCommands — the public command surface for the Project feature.
 *
 * Phase 1 contract. Owned by `projectCommands` today; moves to
 * `features/project/commands/` in Phases 4+.
 */
import type * as projectCommands from "../projectCommands";

export type ProjectCommands = {
  inspectLocalProjectSource: typeof projectCommands.inspectLocalProjectSource;
  loadWorkspaceSnapshot: typeof projectCommands.loadWorkspaceSnapshot;
  createProject: typeof projectCommands.createProject;
  deleteProject: typeof projectCommands.deleteProject;
  updateProjectConfig: typeof projectCommands.updateProjectConfig;
};
