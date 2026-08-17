import { selectWorkspaceFileTreeRefreshVersion } from "../../state/workspaceSelectors";
import { workspaceStore } from "../../state/workspaceStore";
import { workspaceUiStore } from "../../state/workspaceUiStore";

const EMPTY_CHANGED_RELATIVE_PATHS: string[] = [];

/**
 * Workspace feature read-only hooks — the stable read surface for Workspace
 * State (Phase 17, desktop6.md). Cross-feature UI subscribes to workspace state
 * through these hooks instead of importing the Workspace Store directly.
 */

/** Subscribes to the selected workspace id. */
export function useSelectedWorkspaceId() {
  return workspaceStore((state) => state.selectedWorkspaceId);
}

/** Subscribes to the worktree path of the selected workspace. */
export function useSelectedWorkspaceWorktreePath() {
  return workspaceStore(
    (state) =>
      state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId)?.worktreePath?.trim() ?? "",
  );
}

/** Subscribes to the file-tree refresh version for the selected workspace. */
export function useWorkspaceGitRefreshVersion(worktreePath: string) {
  return workspaceStore((state) => {
    if (!worktreePath) {
      return 0;
    }
    return selectWorkspaceFileTreeRefreshVersion(worktreePath);
  });
}

/** Subscribes to the selected entry path in the file tree. */
export function useSelectedEntryPath() {
  return workspaceUiStore((state) => state.selectedEntryPath);
}

/** Subscribes to the expanded file-tree items map by workspace id. */
export function useExpandedFileTreeItemsByWorkspaceId() {
  return workspaceUiStore((state) => state.expandedFileTreeItemsByWorkspaceId);
}

/** Subscribes to the file-tree refresh version. */
export function useFileTreeRefreshVersion() {
  return workspaceUiStore((state) => state.fileTreeRefreshVersion);
}

/** Subscribes to the changed relative paths for the selected workspace. */
export function useChangedRelativePathsForSelectedWorkspace(worktreePath: string) {
  return workspaceUiStore((state) => {
    if (!worktreePath) {
      return EMPTY_CHANGED_RELATIVE_PATHS;
    }
    return state.fileTreeChangedRelativePathsByWorktreePath?.[worktreePath] ?? EMPTY_CHANGED_RELATIVE_PATHS;
  });
}

/** Subscribes to the delete-selection request id. */
export function useDeleteSelectionRequestId() {
  return workspaceUiStore((state) => state.deleteSelectionRequestId);
}

/** Subscribes to the undo request id. */
export function useUndoRequestId() {
  return workspaceUiStore((state) => state.undoRequestId);
}

/** Subscribes to the select-folder-in-file-tree path. */
export function useSelectFolderInFileTreePath() {
  return workspaceUiStore((state) => state.selectFolderInFileTreePath);
}

/** Subscribes to the select-folder-in-file-tree request id. */
export function useSelectFolderInFileTreeRequestId() {
  return workspaceUiStore((state) => state.selectFolderInFileTreeRequestId);
}

/** Subscribes to the workspace list. */
export function useWorkspaces() {
  return workspaceStore((state) => state.workspaces);
}

/** Subscribes to the selected project id. */
export function useSelectedProjectId() {
  return workspaceStore((state) => state.selectedProjectId);
}
