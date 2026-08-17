import { workbenchNavigationStore } from "@renderer/features/workbench";
import { openTab } from "@renderer/features/workbench";
import { useSelectedWorkspaceWorktreePath } from "@renderer/features/workspace";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileQuickOpenDialog } from "@renderer/features/files";
import {
  isAudioFile,
  isExcalidrawFile,
  isImageFile,
  isUnsupportedFileTab,
  isVideoFile,
} from "../../../helpers/editorLanguage";
import { buildWorkspaceFileUrl, readFile } from "../commands/fileCommands";
import { setExpandedFileTreeItems, setSelectedEntryPath } from "../commands/fileTreeCommands";
import { fileTreeStore } from "../state/fileTreeStore";
import { LARGE_FILE_OPEN_THRESHOLD_BYTES, getUtf8ByteLength } from "./fileTreeHelpers";
import { useFileSearchController } from "./useFileSearchController";

export function FileSearchOverlay() {
  const { t } = useTranslation();
  const selectedWorkspaceWorktreePath = useSelectedWorkspaceWorktreePath();
  const selectedWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const openFileSearchRequestKey = fileTreeStore((state) => state.fileSearchRequestKey);
  const expandedItemsByWorkspaceId = fileTreeStore((state) => state.expandedFileTreeItemsByWorkspaceId);

  const [lastHandledFileSearchRequestKey, setLastHandledFileSearchRequestKey] = useState(
    () => fileTreeStore.getState().fileSearchRequestKey,
  );

  const openSearchResult = useCallback(
    async (path: string) => {
      if (!selectedWorkspaceId) {
        return;
      }

      if (path.endsWith("/")) {
        const directoryPath = path.replace(/\/+$/, "");
        const items = expandedItemsByWorkspaceId[selectedWorkspaceId] ?? [];
        if (!items.includes(directoryPath)) {
          setExpandedFileTreeItems(selectedWorkspaceId, [...items, directoryPath]);
        }
        setSelectedEntryPath(directoryPath);
        return;
      }

      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        if (isUnsupportedFileTab(path)) {
          openTab({
            workspaceId: selectedWorkspaceId,
            kind: "file",
            path,
            content: "",
            temporary: true,
            isUnsupported: true,
            unsupportedReason: "type",
          });
          setSelectedEntryPath(path);
          return;
        }

        if (isImageFile(path)) {
          openTab({
            workspaceId: selectedWorkspaceId,
            kind: "image",
            path,
            dataUrl: buildWorkspaceFileUrl({
              workspaceWorktreePath: selectedWorkspaceWorktreePath,
              relativePath: path,
            }),
            temporary: true,
          });
          setSelectedEntryPath(path);
          return;
        }

        if (isVideoFile(path)) {
          openTab({
            workspaceId: selectedWorkspaceId,
            kind: "video",
            path,
            dataUrl: buildWorkspaceFileUrl({
              workspaceWorktreePath: selectedWorkspaceWorktreePath,
              relativePath: path,
            }),
            temporary: true,
          });
          setSelectedEntryPath(path);
          return;
        }

        if (isAudioFile(path)) {
          openTab({
            workspaceId: selectedWorkspaceId,
            kind: "audio",
            path,
            dataUrl: buildWorkspaceFileUrl({
              workspaceWorktreePath: selectedWorkspaceWorktreePath,
              relativePath: path,
            }),
            temporary: true,
          });
          setSelectedEntryPath(path);
          return;
        }

        const response = await readFile({ workspaceId: selectedWorkspaceId, relativePath: path });

        if (!isExcalidrawFile(path) && getUtf8ByteLength(response.content) > LARGE_FILE_OPEN_THRESHOLD_BYTES) {
          openTab({
            workspaceId: selectedWorkspaceId,
            kind: "file",
            path,
            content: "",
            temporary: true,
            isUnsupported: true,
            unsupportedReason: "size",
          });
          setSelectedEntryPath(path);
          return;
        }

        openTab({
          workspaceId: selectedWorkspaceId,
          kind: "file",
          path,
          content: response.content,
          temporary: true,
        });
        setSelectedEntryPath(path);
      } catch (error) {
        console.error("Failed to open workspace file via quick-open", error);
      }
    },
    [selectedWorkspaceId, selectedWorkspaceWorktreePath, expandedItemsByWorkspaceId],
  );

  const {
    isFileSearchOpen,
    setIsFileSearchOpen,
    fileSearchQuery,
    setFileSearchQuery,
    selectedSearchResultIndex,
    setSelectedSearchResultIndex,
    fileSearchResults,
    handleFileSearchInputKeyDown,
    openSearchResultAndClose,
  } = useFileSearchController({
    workspaceId: selectedWorkspaceId || undefined,
    openFileSearchRequestKey,
    lastHandledFileSearchRequestKey,
    onFileSearchRequestHandled: (requestKey) => {
      setLastHandledFileSearchRequestKey(requestKey);
    },
    openSearchResult,
  });

  return (
    <FileQuickOpenDialog
      open={isFileSearchOpen}
      query={fileSearchQuery}
      selectedResultIndex={selectedSearchResultIndex}
      results={fileSearchResults}
      placeholder={t("files.search.placeholder")}
      emptyText={t("files.search.empty")}
      onClose={() => {
        setIsFileSearchOpen(false);
      }}
      onQueryChange={(nextQuery) => {
        setFileSearchQuery(nextQuery);
        setSelectedSearchResultIndex(0);
      }}
      onInputKeyDown={handleFileSearchInputKeyDown}
      onSelectResultIndex={setSelectedSearchResultIndex}
      onOpenResult={(path, index) => {
        setSelectedSearchResultIndex(index);
        void openSearchResultAndClose(path);
      }}
    />
  );
}
