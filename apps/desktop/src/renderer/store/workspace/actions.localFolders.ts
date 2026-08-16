import type { DaemonLocalFolder } from "../../rpc/daemonTypes";
import { sessionStore } from "../sessionStore";
import { getFileName } from "../tabs";
import type {
  WorkspaceHealth,
  WorkspaceItem,
  WorkspaceLifecycleState,
  WorkspaceStoreActions,
  WorkspaceStoreGetState,
  WorkspaceStoreSetState,
  WorkspaceStoreState,
} from "../types";
import { LOCAL_FOLDER_PROJECT_ID } from "../types";

type LocalFolderActions = Pick<WorkspaceStoreActions, "loadLocalFolders" | "addLocalFolder" | "removeLocalFolder">;

type FolderStoreSlice = Pick<
  WorkspaceStoreState,
  "projects" | "workspaces" | "selectedProjectId" | "selectedWorkspaceId"
> & {
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

        if (state.selectedWorkspaceId === folderId) {
          state.selectedWorkspaceId =
            state.workspaces.find((workspace) => workspace.projectId === LOCAL_FOLDER_PROJECT_ID)?.id ??
            state.workspaces[0]?.id ??
            "";
        }

        // The sentinel project id is never present in projects[]. If no folder
        // workspace remains selected, fall back so the left pane never shows the
        // folder group as "selected" while a real project is active. Mirrors
        // applyDeletedWorkspaceState's selectedProjectId reset.
        if (
          state.selectedProjectId === LOCAL_FOLDER_PROJECT_ID &&
          !state.workspaces.some(
            (workspace) =>
              workspace.id === state.selectedWorkspaceId &&
              (workspace.projectId ?? workspace.repoId) === LOCAL_FOLDER_PROJECT_ID,
          )
        ) {
          state.selectedProjectId = state.projects[0]?.id ?? "";
        }
      });
    },
  };
}
