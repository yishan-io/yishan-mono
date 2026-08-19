import { getFileName } from "@shared/path/pathHelpers";
import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";

import type { DaemonLocalFolder } from "../../local-folder/snapshotTypes";
import type { WorkspaceHealth, WorkspaceItem, WorkspaceLifecycleState } from "../../workspaceTypes";
import type {
  WorkspaceStoreActions,
  WorkspaceStoreGetState,
  WorkspaceStoreSetState,
  WorkspaceStoreState,
} from "../workspaceStoreTypes";
import { sessionStore } from "@renderer/domains/session";

type LocalFolderActions = Pick<WorkspaceStoreActions, "loadLocalFolders" | "addLocalFolder" | "removeLocalFolder">;

type FolderStoreSlice = Pick<WorkspaceStoreState, "workspaces"> & {
  gitChangesCountByWorkspaceId?: Record<string, unknown>;
  gitChangeTotalsByWorkspaceId?: Record<string, unknown>;
};

const FOLDER_STATES = new Set<string>(["active", "error", "closing"]);
const FOLDER_HEALTHS = new Set<string>(["path-missing", "not-worktree"]);

function normalizeFolderState(state: string | undefined): WorkspaceLifecycleState | undefined {
  return state !== undefined && FOLDER_STATES.has(state) ? (state as WorkspaceLifecycleState) : undefined;
}

function normalizeFolderHealth(health: string | undefined): WorkspaceHealth | undefined {
  return health !== undefined && FOLDER_HEALTHS.has(health) ? (health as WorkspaceHealth) : undefined;
}

/** Maps a daemon local-folder record into a synthetic workspace list item. */
function toFolderWorkspaceItem(folder: DaemonLocalFolder): WorkspaceItem {
  const path = folder.path?.trim() ?? "";
  const displayName = folder.name?.trim() || getFileName(path) || path;

  return {
    id: folder.id,
    projectId: LOCAL_FOLDER_PROJECT_ID,
    repoId: folder.id,
    name: displayName,
    title: displayName,
    sourceBranch: "",
    branch: "",
    summaryId: folder.id,
    worktreePath: path,
    nodeId: sessionStore.getState().daemonId?.trim() || undefined,
    kind: "folder",
    status: "active",
    state: normalizeFolderState(folder.state),
    health: normalizeFolderHealth(folder.health),
  };
}

/**
 * Replaces the local-folder subset of workspaces[] with the given daemon
 * records. Idempotent across repeated snapshot merges: any prior folder items
 * are removed first, then the mapped items are appended (deduped by folder id).
 */
function applyFolderSnapshot(state: FolderStoreSlice, folders: DaemonLocalFolder[]): void {
  state.workspaces = state.workspaces.filter((workspace) => workspace.projectId !== LOCAL_FOLDER_PROJECT_ID);

  const seen = new Set<string>();
  for (const folder of folders) {
    if (!folder?.id || seen.has(folder.id)) {
      continue;
    }
    seen.add(folder.id);
    state.workspaces.push(toFolderWorkspaceItem(folder));
  }
}

/** Removes workspace-scoped UI caches that are keyed by a folder workspace id. */
function cleanupFolderWorkspaceState(state: FolderStoreSlice, folderId: string): void {
  delete state.gitChangesCountByWorkspaceId?.[folderId];
  delete state.gitChangeTotalsByWorkspaceId?.[folderId];
}

export function createLocalFolderActions(
  set: WorkspaceStoreSetState,
  _get: WorkspaceStoreGetState,
): LocalFolderActions {
  return {
    loadLocalFolders: (folders) => {
      set((state) => {
        applyFolderSnapshot(state, folders);
      });
    },
    addLocalFolder: (folder) => {
      if (!folder?.id) {
        return;
      }

      set((state) => {
        const nextItem = toFolderWorkspaceItem(folder);
        const existing = state.workspaces.find((workspace) => workspace.id === folder.id);
        if (existing) {
          Object.assign(existing, nextItem);
        } else {
          state.workspaces.push(nextItem);
        }
      });
    },
    removeLocalFolder: (id) => {
      const folderId = id.trim();
      if (!folderId) {
        return;
      }

      set((state) => {
        const removedIndex = state.workspaces.findIndex((workspace) => workspace.id === folderId);
        if (removedIndex >= 0) {
          state.workspaces.splice(removedIndex, 1);
        }

        cleanupFolderWorkspaceState(state, folderId);
      });
    },
  };
}
