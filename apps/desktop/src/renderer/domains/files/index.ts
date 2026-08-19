/**
 * Files feature public API (Phase 12, desktop5.md).
 */
export {
  createFile,
  createFolder,
  deleteEntry,
  listDetectedExternalAppIds,
  listFiles,
  openEntryInExternalApp,
  readDiff,
  readExternalClipboardSourcePaths,
  readFile,
  renameEntry,
  resolveChatFilePath,
  searchFiles,
  writeFile,
} from "./commands/fileCommands";
export { resolveWorkspaceAbsolutePath } from "./features/file-manager/fileTreeHelpers";
export { useDetectedExternalAppIds } from "./hooks/useDetectedExternalAppIds";
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
  removeFileTabContent,
  seedFileTabContent,
  updateFileTabContent,
} from "./commands/fileTabContentCommands";

// Stable UI entry points for cross-feature composition (Phase 18).
export { useFileSearchController } from "./features/quick-open-file/useFileSearchController";
export { FileSearchOverlay } from "./features/quick-open-file/FileSearchOverlay";
export { FileManagerView } from "./features/file-manager/FileManagerView";
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
} from "./features/file-manager/file-tree/dataTransfer";
export { getFileTreeIcon } from "./ui/fileTreeIcons";
export { FileTree, type FileTreeProps } from "./features/file-manager/file-tree";
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
} from "./features/file-editor/editors";
export { DiagramZoomOverlay } from "./ui/DiagramZoomOverlay";
export { getDiffCssVariablesForPalette } from "./ui/diffTheme";

export {
  EXTERNAL_APP_MENU_ENTRIES,
  SYSTEM_FILE_MANAGER_APP_ID,
  findExternalAppPreset,
  getExternalAppMenuEntries,
  isExternalAppPlatformSupported,
  isExternalAppPresetReliablyDetectableOnPlatform,
  isExternalAppPresetSupportedOnPlatform,
  type ExternalAppId,
  type ExternalAppMenuEntry,
  type ExternalAppPreset,
} from "./externalApps";
export type { ExternalClipboardReadOutcome, WorkspaceFileEntry } from "./externalApps";

export { isAbsoluteUrl, resolveRelativePath, toWorkspaceRelativePath } from "./ui/markdown/markdownHelpers";
export { markdownService } from "./ui/markdown/markdownService";
export { useMarkdownStyles } from "./ui/markdown/markdownStyles";

export { MarkdownPreview } from "./ui/markdown/MarkdownPreview";
export { createFileTabPlaceholder } from "./features/file-editor/fileTabPlaceholder";
export {
  getFileExtension,
  getLanguageId,
  getSupportedExtensions,
  isAudioFile,
  isExcalidrawFile,
  isImageFile,
  isLanguageSupported,
  isMarkdownFile,
  isUnsupportedFileTab,
  isVideoFile,
} from "./features/file-editor/editorLanguage";
export {
  computeGitLineChanges,
  getHunkForLine,
  type GitLineChange,
  type GitLineChangeKind,
} from "./features/file-editor/git-gutter/gitGutterDiff";
export { YISHAN_THEME_DARK, YISHAN_THEME_LIGHT, ensureEditorThemes, monaco } from "./features/file-editor/monacoSetup";
