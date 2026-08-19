/**
 * Files feature file-tree Commands (desktop6-adjust.md W3).
 *
 * Public write surface for file-tree interaction signals that previously
 * lived in the Workspace UI Store. Cross-module code (workspace commands,
 * events, project commands) applies file-tree state changes through these
 * functions instead of importing the Files Store directly.
 */
import { fileTreeStore } from "../state/fileTreeStore";

/** Selects one entry path in the file tree. */
export function setSelectedEntryPath(path: string): void {
  fileTreeStore.getState().setSelectedEntryPath(path);
}

/** Sets the expanded file-tree items for one workspace. */
export function setExpandedFileTreeItems(workspaceId: string, paths: string[]): void {
  fileTreeStore.getState().setExpandedFileTreeItems(workspaceId, paths);
}

/** Bumps the file-tree refresh version for one workspace. */
export function incrementFileTreeRefreshVersion(workspaceWorktreePath?: string, changedRelativePaths?: string[]): void {
  fileTreeStore.getState().incrementFileTreeRefreshVersion(workspaceWorktreePath, changedRelativePaths);
}

/** Requests opening the workspace file search overlay. */
export function requestFileSearch(): void {
  fileTreeStore.getState().requestFileSearch();
}

/** Requests deletion of the currently selected file-tree entry. */
export function requestDeleteSelection(): void {
  fileTreeStore.getState().requestDeleteSelection();
}

/** Requests undo of the latest file-tree operation. */
export function requestUndo(): void {
  fileTreeStore.getState().requestUndo();
}

/** Requests selecting a folder path in the file tree. */
export function requestSelectFolderInFileTree(path: string): void {
  fileTreeStore.getState().requestSelectFolderInFileTree(path);
}
