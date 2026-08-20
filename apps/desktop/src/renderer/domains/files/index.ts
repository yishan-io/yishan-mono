/**
 * Files feature public API.
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
export { resolveWorkspaceAbsolutePath } from "./features/file-manager/fileTreeEntries";
export { useDetectedExternalAppIds } from "./hooks/useDetectedExternalAppIds";
export {
  incrementFileTreeRefreshVersion,
  requestDeleteSelection,
  requestFileSearch,
  requestSelectFolderInFileTree,
  requestUndo,
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

// Stable UI entry points for cross-feature composition.

export { FileSearchOverlay } from "./features/quick-open-file/FileSearchOverlay";
export { FileManagerView } from "./features/file-manager/FileManagerView";
export {
  FILETREE_DRAG_MIME,
  extractSourcePathsFromDataTransfer,
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
} from "./ui/filePathDisplay";
export { FileEditor } from "./features/file-editor/FileEditor";
export { AudioPreview } from "./features/file-editor/AudioPreview";
export { ImagePreview } from "./features/file-editor/ImagePreview";
export { UnsupportedFileView } from "./features/file-editor/UnsupportedFileView";
export { VideoPreview } from "./features/file-editor/VideoPreview";

export { FileDiffViewer } from "./features/diff-viewer/FileDiffViewer";
export { MultiFileDiffViewer } from "./features/diff-viewer/MultiFileDiffViewer";

export { getDiffCssVariablesForPalette } from "./ui/diffTheme";

export {
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

export {
  isAbsoluteUrl,
  resolveRelativePath,
  toWorkspaceRelativePath,
} from "./features/markdown-preview/markdownTransform";
export { markdownService } from "./features/markdown-preview/markdownService";
export { useMarkdownStyles } from "./features/markdown-preview/markdownStyles";

export { MarkdownPreview } from "./features/markdown-preview/MarkdownPreview";
export { createFileTabPlaceholder } from "./features/file-editor/fileTabPlaceholder";
export { getFileExtension } from "./features/file-editor/monaco/editorLanguage";
export type { GitLineChange, GitLineChangeKind } from "./features/file-editor/git-gutter/gitGutterDiff";
export { monaco } from "./features/file-editor/monaco/monacoSetup";
