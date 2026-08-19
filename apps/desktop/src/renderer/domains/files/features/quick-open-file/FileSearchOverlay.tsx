import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { openTab } from "@renderer/domains/workbench";

import { workspaceStore } from "@renderer/domains/workspace";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildWorkspaceFileUrl, readFile } from "../../commands/fileCommands";
import { setExpandedFileTreeItems, setSelectedEntryPath } from "../../commands/fileTreeCommands";
import {
  isAudioFile,
  isExcalidrawFile,
  isImageFile,
  isUnsupportedFileTab,
  isVideoFile,
} from "../../features/file-editor/editorLanguage";
import { fileTreeStore } from "../../state/fileTreeStore";
import { FileQuickOpenDialog } from "./FileQuickOpenDialog";
import { LARGE_FILE_OPEN_THRESHOLD_BYTES, getUtf8ByteLength } from "../file-manager/fileTreeEntries";
import { useFileSearchController } from "./useFileSearchController";

export function FileSearchOverlay() {
  const { t } = useTranslation();
  const selectedWorkspaceWorktreePath = workspaceStore(
    (state) =>
      state.workspaces
        .find((workspace) => workspace.id === workbenchNavigationStore.getState().activeWorkspaceId)
        ?.worktreePath?.trim() ?? "",
  );
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
      onQueryChange={(nextQuery: string) => {
        setFileSearchQuery(nextQuery);
        setSelectedSearchResultIndex(0);
      }}
      onInputKeyDown={handleFileSearchInputKeyDown}
      onSelectResultIndex={setSelectedSearchResultIndex}
      onOpenResult={(path: string, index: number) => {
        setSelectedSearchResultIndex(index);
        void openSearchResultAndClose(path);
      }}
    />
  );
}
