import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildWorkspaceFileUrl, readFile } from "../../commands/fileCommands";
import { FileQuickOpenDialog } from "../../components/FileQuickOpenDialog";
import { isImageFile, isUnsupportedFileTab } from "../../helpers/editorLanguage";
import { tabStore } from "../../store/tabStore";
import { workspaceStore } from "../../store/workspaceStore";
import { workspaceUiStore } from "../../store/workspaceUiStore";
import { LARGE_FILE_OPEN_THRESHOLD_BYTES, getUtf8ByteLength } from "./RightPane/fileTreeHelpers";
import { useFileSearchController } from "./RightPane/useFileSearchController";

export function FileSearchOverlay() {
  const { t } = useTranslation();
  const selectedWorkspaceWorktreePath = workspaceStore(
    (state) =>
      state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId)?.worktreePath?.trim() ?? "",
  );
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const openFileSearchRequestKey = workspaceUiStore((state) => state.fileSearchRequestKey);
  const setSelectedEntryPath = workspaceUiStore((state) => state.setSelectedEntryPath);
  const expandedItemsByWorkspaceId = workspaceUiStore((state) => state.expandedFileTreeItemsByWorkspaceId);
  const setExpandedFileTreeItems = workspaceUiStore((state) => state.setExpandedFileTreeItems);

  const [lastHandledFileSearchRequestKey, setLastHandledFileSearchRequestKey] = useState(
    () => workspaceUiStore.getState().fileSearchRequestKey,
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
          tabStore.getState().openTab({
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
          tabStore.getState().openTab({
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

        const response = await readFile({ workspaceId: selectedWorkspaceId, relativePath: path });

        if (getUtf8ByteLength(response.content) > LARGE_FILE_OPEN_THRESHOLD_BYTES) {
          tabStore.getState().openTab({
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

        tabStore.getState().openTab({
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
    [
      selectedWorkspaceId,
      selectedWorkspaceWorktreePath,
      expandedItemsByWorkspaceId,
      setExpandedFileTreeItems,
      setSelectedEntryPath,
    ],
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
