/**
 * Workspace Store State types (desktop6-adjust.md W1).
 *
 * Owned by the Workspace feature State. Previously defined under
 * `features/workbench/model/types.ts`; that file must not define Workspace
 * Store types.
 *
 * Transport DTO references (ProjectRecord, WorkspaceRecord, DaemonLocalFolder)
 * remain on the store action boundary until the Workspace Store moves to
 * feature-owned inputs; they are the transport surface of the store and are
 * baselined by the R6 allowlist.
 */
import type { StateCreator } from "zustand";
import type { ProjectRecord, WorkspaceRecord } from "../../../api/types";
import type { DaemonLocalFolder } from "../../../rpc/daemonTypes";
import type { WorkspaceProjectRecord } from "../../project/model/projectTypes";
import type { AddWorkspaceInput, WorkspaceItem } from "../model/workspaceTypes";

export type { DaemonLocalFolder } from "../../../rpc/daemonTypes";

export type WorkspaceStoreState = {
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
  isProjectsLoaded: boolean;
  orderedWorkspaceIds: string[];
  load: (organizationId: string, projects: ProjectRecord[], workspaces: WorkspaceRecord[]) => void;
  createProject: (input: {
    name: string;
    source: "local" | "remote";
    path?: string;
    gitUrl?: string;
    backendProject: WorkspaceProjectRecord;
    organizationId: string;
  }) => void;
  deleteProject: (projectId: string) => void;
  updateProjectConfig: (
    projectId: string,
    config: Pick<
      WorkspaceProjectRecord,
      "name" | "worktreePath" | "contextEnabled" | "icon" | "color" | "setupScript" | "postScript" | "commands"
    >,
  ) => void;
  addWorkspace: (input: AddWorkspaceInput) => void;
  removeWorkspace: (input: {
    projectId?: string;
    repoId?: string;
    workspaceId: string;
  }) => void;
  renameWorkspace: (input: {
    projectId?: string;
    repoId?: string;
    workspaceId: string;
    name: string;
  }) => void;
  renameWorkspaceBranch: (input: {
    projectId?: string;
    repoId?: string;
    workspaceId: string;
    branch: string;
  }) => void;
  reorderWorkspace: (input: {
    draggedWorkspaceId: string;
    targetWorkspaceId: string;
    position: "before" | "after";
  }) => void;
  loadLocalFolders: (folders: DaemonLocalFolder[]) => void;
  addLocalFolder: (folder: DaemonLocalFolder) => void;
  removeLocalFolder: (id: string) => void;
  setOrderedWorkspaceIds: (ids: string[]) => void;
};

export type WorkspaceStorePersistedState = Record<string, never>;

export type WorkspaceStoreActions = Pick<
  WorkspaceStoreState,
  | "load"
  | "createProject"
  | "deleteProject"
  | "updateProjectConfig"
  | "addWorkspace"
  | "removeWorkspace"
  | "renameWorkspace"
  | "renameWorkspaceBranch"
  | "reorderWorkspace"
  | "loadLocalFolders"
  | "addLocalFolder"
  | "removeLocalFolder"
  | "setOrderedWorkspaceIds"
>;

export type WorkspaceStoreCreator = StateCreator<
  WorkspaceStoreState,
  [["zustand/immer", never]],
  [],
  WorkspaceStoreState
>;

export type WorkspaceStoreSetState = Parameters<WorkspaceStoreCreator>[0];
export type WorkspaceStoreGetState = Parameters<WorkspaceStoreCreator>[1];
