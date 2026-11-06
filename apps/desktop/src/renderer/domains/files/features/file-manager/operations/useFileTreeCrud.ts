import {
  buildWorkspaceFileUrl,
  createFile,
  createFolder,
  deleteEntry,
  openEntryInExternalApp,
  readFile,
  renameEntry,
} from "@renderer/domains/files/commands/fileCommands";
import { recordLastUsedExternalApp } from "@renderer/domains/project";
import { sessionStore } from "@renderer/domains/session";
import type { OpenTabInput, WorkbenchTab } from "@renderer/domains/workbench";
import { writeClipboardText } from "@renderer/platform/clipboard";
import { useCallback, useRef } from "react";
import { type ExternalAppId, SYSTEM_FILE_MANAGER_APP_ID, type WorkspaceFileEntry } from "../../../externalApps";
import {
  isAudioFile,
  isExcalidrawFile,
  isImageFile,
  isUnsupportedFileTab,
  isVideoFile,
} from "../../file-editor/monaco/editorLanguage";
import { LARGE_FILE_OPEN_THRESHOLD_BYTES, getUtf8ByteLength, resolveWorkspaceAbsolutePath } from "../fileTreeEntries";
import type { FileTreeUndoAction } from "../operations/useFileTreeUndo";
import { isDeletedPathDirectory, resolveTabIdsToCloseAfterDelete } from "../rightPaneDelete";

const alwaysCurrent = () => true;

type UseFileTreeCrudInput = {
  isCurrentListing?: () => boolean;
  selectedWorkspaceWorktreePath: string | undefined;
  selectedWorkspaceId: string | undefined;
  tabs: WorkbenchTab[];
  repoFiles: string[];
  /** Full entry list from the daemon — used to look up isIgnored at tab-open time. */
  repoEntries: WorkspaceFileEntry[];
  closeTab: (tabId: string) => void;
  renameTabsForEntryRename: (workspaceId: string, fromPath: string, toPath: string) => void;
  openTab: (tab: OpenTabInput) => void;
  loadAllRepoFiles: () => Promise<string[]>;
  pushUndoAction: (action: FileTreeUndoAction) => void;
  requestFileTreeSelection: (path: string | null, focus?: boolean) => void;
};

export function useFileTreeCrud({
  isCurrentListing = alwaysCurrent,
  selectedWorkspaceWorktreePath,
  selectedWorkspaceId,
  tabs,
  repoFiles,
  repoEntries,
  closeTab,
  renameTabsForEntryRename,
  openTab,
  loadAllRepoFiles,
  pushUndoAction,
  requestFileTreeSelection,
}: UseFileTreeCrudInput) {
  const isDeletingEntryRef = useRef(false);

  const openWorkspaceFile = useCallback(
    async (path: string, options?: { temporary?: boolean }) => {
      if (!isCurrentListing() || !selectedWorkspaceWorktreePath) {
        return;
      }

      const entry = repoEntries.find((e) => e.path === path);
      const isIgnored = entry?.isIgnored ?? false;

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
            isIgnored,
          });
          requestFileTreeSelection(path, false);
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
            temporary: Boolean(options?.temporary),
          });
          requestFileTreeSelection(path, false);
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
            temporary: Boolean(options?.temporary),
          });
          requestFileTreeSelection(path, false);
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
            temporary: Boolean(options?.temporary),
          });
          requestFileTreeSelection(path, false);
          return;
        }

        const response = await readFile({
          workspaceId: selectedWorkspaceId ?? "",
          relativePath: path,
        });
        if (!isCurrentListing()) return;

        if (!isExcalidrawFile(path) && getUtf8ByteLength(response.content) > LARGE_FILE_OPEN_THRESHOLD_BYTES) {
          openTab({
            workspaceId: selectedWorkspaceId,
            kind: "file",
            path,
            content: "",
            temporary: Boolean(options?.temporary),
            isUnsupported: true,
            unsupportedReason: "size",
            isIgnored,
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
          isIgnored,
        });
        requestFileTreeSelection(path, false);
      } catch (error) {
        console.error("Failed to load workspace workspace file", error);
      }
    },
    [isCurrentListing, openTab, repoEntries, requestFileTreeSelection, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const handleDeleteEntry = useCallback(
    async (targetPath: string) => {
      if (!isCurrentListing() || !targetPath || !selectedWorkspaceWorktreePath || isDeletingEntryRef.current) {
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
            if (!isCurrentListing()) return;

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
        if (!isCurrentListing()) return;

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
    [isCurrentListing, closeTab, loadAllRepoFiles, pushUndoAction, repoFiles, selectedWorkspaceId, selectedWorkspaceWorktreePath, tabs],
  );

  const onCreateFile = useCallback(
    async (path: string) => {
      if (!isCurrentListing() || !selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        await createFile({
          workspaceId: selectedWorkspaceId ?? "",
          relativePath: path,
          content: "",
        });
        if (!isCurrentListing()) return;

        await loadAllRepoFiles();
        if (!isCurrentListing()) return;

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
    [isCurrentListing, openTab, pushUndoAction, loadAllRepoFiles, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const onCreateFolder = useCallback(
    async (path: string) => {
      if (!isCurrentListing() || !selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        await createFolder({
          workspaceId: selectedWorkspaceId ?? "",
          relativePath: path,
        });
        if (!isCurrentListing()) return;

        pushUndoAction({
          kind: "create-folder",
          path,
        });
        await loadAllRepoFiles();
      } catch (error) {
        console.error("Failed to create workspace folder", error);
      }
    },
    [isCurrentListing, loadAllRepoFiles, pushUndoAction, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const onRenameEntry = useCallback(
    async (path: string, nextName: string) => {
      if (!isCurrentListing() || !selectedWorkspaceWorktreePath) {
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
        if (!isCurrentListing()) return;

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
    [isCurrentListing, pushUndoAction, loadAllRepoFiles, renameTabsForEntryRename, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const onCopyPath = useCallback(
    async (path: string) => {
      if (!isCurrentListing() || !selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        const absolutePath = resolveWorkspaceAbsolutePath(selectedWorkspaceWorktreePath, path);
        await writeClipboardText(absolutePath);
      } catch (error) {
        console.error("Failed to copy workspace entry path", error);
      }
    },
    [isCurrentListing, selectedWorkspaceWorktreePath],
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
      if (!isCurrentListing() || !selectedWorkspaceWorktreePath) {
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
    [isCurrentListing, selectedWorkspaceWorktreePath],
  );

  const onOpenInExternalApp = useCallback(
    async (input: { path?: string; appId: ExternalAppId }) => {
      if (!isCurrentListing() || !selectedWorkspaceWorktreePath) {
        return;
      }

      const selectedOrganizationId = sessionStore.getState().selectedOrganizationId ?? "";

      try {
        await openEntryInExternalApp({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          appId: input.appId,
          relativePath: input.path?.trim() || undefined,
        });
        if (!isCurrentListing()) return;
        recordLastUsedExternalApp(selectedOrganizationId, input.appId);
      } catch (error) {
        console.error("Failed to open workspace entry in external app", error);
      }
    },
    [isCurrentListing, selectedWorkspaceWorktreePath],
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
