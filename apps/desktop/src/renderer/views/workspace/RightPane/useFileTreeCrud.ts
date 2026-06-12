import { useCallback, useRef } from "react";
import type { WorkspaceTab, OpenWorkspaceTabInput } from "../../../store/types";
import {
  createFile,
  createFolder,
  deleteEntry,
  openEntryInExternalApp,
  readFile,
  buildWorkspaceFileUrl,
  renameEntry,
  writeClipboardText,
} from "../../../commands/fileCommands";
import { isImageFile, isUnsupportedFileTab } from "../../../helpers/editorLanguage";
import { SYSTEM_FILE_MANAGER_APP_ID, type ExternalAppId } from "../../../../shared/contracts/externalApps";
import { getUtf8ByteLength, LARGE_FILE_OPEN_THRESHOLD_BYTES, resolveWorkspaceAbsolutePath } from "./fileTreeHelpers";
import { isDeletedPathDirectory, resolveTabIdsToCloseAfterDelete } from "./rightPaneDelete";
import type { FileTreeUndoAction } from "./useFileTreeUndo";

type UseFileTreeCrudInput = {
  selectedWorkspaceWorktreePath: string | undefined;
  selectedWorkspaceId: string | undefined;
  tabs: WorkspaceTab[];
  repoFiles: string[];
  closeTab: (tabId: string) => void;
  renameTabsForEntryRename: (workspaceId: string, fromPath: string, toPath: string) => void;
  openTab: (tab: OpenWorkspaceTabInput) => void;
  setLastUsedExternalAppId: (id: ExternalAppId) => void;
  loadAllRepoFiles: () => Promise<string[]>;
  pushUndoAction: (action: FileTreeUndoAction) => void;
  requestFileTreeSelection: (path: string | null, focus?: boolean) => void;
};

export function useFileTreeCrud({
  selectedWorkspaceWorktreePath,
  selectedWorkspaceId,
  tabs,
  repoFiles,
  closeTab,
  renameTabsForEntryRename,
  openTab,
  setLastUsedExternalAppId,
  loadAllRepoFiles,
  pushUndoAction,
  requestFileTreeSelection,
}: UseFileTreeCrudInput) {
  const isDeletingEntryRef = useRef(false);

  const openWorkspaceFile = useCallback(
    async (path: string, options?: { temporary?: boolean }) => {
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
            temporary: Boolean(options?.temporary),
            isUnsupported: true,
            unsupportedReason: "type",
          });
          requestFileTreeSelection(path, false);
          return;
        }

        if (isImageFile(path)) {
          openTab({
            workspaceId: selectedWorkspaceId,
            kind: "image",
            path,
            dataUrl: buildWorkspaceFileUrl({ workspaceWorktreePath: selectedWorkspaceWorktreePath, relativePath: path }),
            temporary: Boolean(options?.temporary),
          });
          requestFileTreeSelection(path, false);
          return;
        }

        const response = await readFile({
          workspaceId: selectedWorkspaceId ?? "",
          relativePath: path,
        });

        if (getUtf8ByteLength(response.content) > LARGE_FILE_OPEN_THRESHOLD_BYTES) {
          openTab({
            workspaceId: selectedWorkspaceId,
            kind: "file",
            path,
            content: "",
            temporary: Boolean(options?.temporary),
            isUnsupported: true,
            unsupportedReason: "size",
          });
          requestFileTreeSelection(path, false);
          return;
        }

        openTab({
          workspaceId: selectedWorkspaceId,
          kind: "file",
          path,
          content: response.content,
          temporary: Boolean(options?.temporary),
        });
        requestFileTreeSelection(path, false);
      } catch (error) {
        console.error("Failed to load workspace workspace file", error);
      }
    },
    [openTab, requestFileTreeSelection, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const handleDeleteEntry = useCallback(
    async (targetPath: string) => {
      if (!targetPath || !selectedWorkspaceWorktreePath || isDeletingEntryRef.current) {
        return;
      }

      isDeletingEntryRef.current = true;
      const targetIsDirectory = isDeletedPathDirectory(repoFiles, targetPath);

      try {
        let deleteUndoAction: FileTreeUndoAction | null = null;
        if (!targetIsDirectory) {
          try {
            const response = await readFile({
              workspaceId: selectedWorkspaceId ?? "",
              relativePath: targetPath,
            });

            deleteUndoAction = {
              kind: "delete-file",
              path: targetPath,
              content: response.content,
            };
          } catch (error) {
            console.warn("Failed to capture file content for undo before delete", error);
          }
        }

        await deleteEntry({
          workspaceId: selectedWorkspaceId ?? "",
          relativePath: targetPath,
        });

        const tabIdsToClose = resolveTabIdsToCloseAfterDelete(tabs, targetPath, targetIsDirectory);
        for (const tabId of tabIdsToClose) {
          closeTab(tabId);
        }

        if (deleteUndoAction) {
          pushUndoAction(deleteUndoAction);
        }

        await loadAllRepoFiles();
      } catch (error) {
        console.error("Failed to delete workspace entry", error);
      } finally {
        isDeletingEntryRef.current = false;
      }
    },
    [closeTab, loadAllRepoFiles, pushUndoAction, repoFiles, selectedWorkspaceWorktreePath, tabs],
  );

  const onCreateFile = useCallback(
    async (path: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        await createFile({
          workspaceId: selectedWorkspaceId ?? "",
          relativePath: path,
          content: "",
        });

        await loadAllRepoFiles();

        openTab({
          workspaceId: selectedWorkspaceId,
          kind: "file",
          path,
          content: "",
        });
        pushUndoAction({
          kind: "create-file",
          path,
        });
      } catch (error) {
        console.error("Failed to create workspace file", error);
      }
    },
    [openTab, pushUndoAction, loadAllRepoFiles, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const onCreateFolder = useCallback(
    async (path: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        await createFolder({
          workspaceId: selectedWorkspaceId ?? "",
          relativePath: path,
        });

        pushUndoAction({
          kind: "create-folder",
          path,
        });
        await loadAllRepoFiles();
      } catch (error) {
        console.error("Failed to create workspace folder", error);
      }
    },
    [pushUndoAction, loadAllRepoFiles, selectedWorkspaceWorktreePath],
  );

  const onRenameEntry = useCallback(
    async (path: string, nextName: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      const segments = path.split("/").filter(Boolean);
      if (segments.length === 0) {
        return;
      }

      const parentPath = segments.slice(0, -1).join("/");
      const targetPath = parentPath ? `${parentPath}/${nextName}` : nextName;

      try {
        await renameEntry({
          workspaceId: selectedWorkspaceId ?? "",
          fromRelativePath: path,
          toRelativePath: targetPath,
        });

        renameTabsForEntryRename(selectedWorkspaceId ?? "", path, targetPath);

        pushUndoAction({
          kind: "rename",
          fromPath: path,
          toPath: targetPath,
        });
        await loadAllRepoFiles();
      } catch (error) {
        console.error("Failed to rename workspace entry", error);
      }
    },
    [pushUndoAction, loadAllRepoFiles, renameTabsForEntryRename, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const onCopyPath = useCallback(
    async (path: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        const absolutePath = resolveWorkspaceAbsolutePath(selectedWorkspaceWorktreePath, path);
        await writeClipboardText(absolutePath);
      } catch (error) {
        console.error("Failed to copy workspace entry path", error);
      }
    },
    [selectedWorkspaceWorktreePath],
  );

  const onCopyRelativePath = useCallback(async (path: string) => {
    try {
      await writeClipboardText(path);
    } catch (error) {
      console.error("Failed to copy workspace entry relative path", error);
    }
  }, []);

  const onOpenInFileManager = useCallback(
    async (path: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        await openEntryInExternalApp({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          appId: SYSTEM_FILE_MANAGER_APP_ID,
          relativePath: path,
        });
      } catch (error) {
        console.error("Failed to open workspace entry in file manager", error);
      }
    },
    [selectedWorkspaceWorktreePath],
  );

  const onOpenInExternalApp = useCallback(
    async (input: { path?: string; appId: ExternalAppId }) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        await openEntryInExternalApp({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          appId: input.appId,
          relativePath: input.path?.trim() || undefined,
        });
        setLastUsedExternalAppId(input.appId as ExternalAppId);
      } catch (error) {
        console.error("Failed to open workspace entry in external app", error);
      }
    },
    [selectedWorkspaceWorktreePath, setLastUsedExternalAppId],
  );

  return {
    openWorkspaceFile,
    handleDeleteEntry,
    onCreateFile,
    onCreateFolder,
    onRenameEntry,
    onCopyPath,
    onCopyRelativePath,
    onOpenInFileManager,
    onOpenInExternalApp,
  };
}
