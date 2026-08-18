/**
 * Files feature public API (Phase 12, desktop5.md).
 */
export type { FileCommands } from "./commands/contract";
export { openEntryInExternalApp, readFile, renameEntry } from "./commands/fileCommands";
export { useDetectedExternalAppIds } from "./ui/hooks/useDetectedExternalAppIds";
export {
  incrementFileTreeRefreshVersion,
  requestDeleteSelection,
  requestFileSearch,
  requestSelectFolderInFileTree,
  requestUndo,
  setExpandedFileTreeItems,
  setSelectedEntryPath,
} from "./commands/fileTreeCommands";
export { fileTreeStore, type FileTreeStoreState } from "./state/fileTreeStore";
export { fileTabContentStore, type FileTabContentStoreState } from "./state/fileTabContentStore";
export { createNewWhiteboard, resolveNextWhiteboardPath } from "./commands/whiteboardCommands";
export {
  markFileTabSaved,
  refreshFileTabFromDisk,
  seedFileTabContent,
  updateFileTabContent,
} from "./commands/fileTabContentCommands";

// Stable UI entry points for cross-feature composition (Phase 18).
export { useFileSearchController } from "./ui/useFileSearchController";
export { FileSearchOverlay } from "./ui/FileSearchOverlay";
export { FileManagerView } from "./ui/FileManagerView";
export {
  FILETREE_DRAG_MIME,
  extractInternalDragRelativePaths,
  extractSourcePathsFromDataTransfer,
  extractSourcePathsFromDataTransferAsync,
  hasExternalFileDragIntent,
  hasInternalFileTreeDragIntent,
  resolveInternalFileTreeDragEntries,
  resolveInternalFileTreeDragPaths,
  type FileTreeDragEntry,
} from "./ui/file-tree/dataTransfer";
export { getFileTreeIcon } from "./ui/fileTreeIcons";
export { FileTree, type FileTreeProps } from "./ui/file-tree";
export {
  buildHighlightedPathSegments,
  splitFilePathForDisplay,
  type FilePathDisplayParts,
  type HighlightedPathSegment,
} from "./ui/filePathDisplayHelpers";
export {
  AudioPreview,
  DiffSearchPanel,
  FileDiffViewer,
  FileEditor,
  FileQuickOpenDialog,
  ImagePreview,
  MultiFileDiffViewer,
  UnsupportedFileView,
  VideoPreview,
} from "./ui/editors";
