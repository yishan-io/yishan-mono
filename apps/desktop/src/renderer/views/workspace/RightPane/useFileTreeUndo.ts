import { useCallback, useRef } from "react";
import type { WorkspaceTab } from "../../../store/types";
import {
  createFile,
  deleteEntry,
  renameEntry,
} from "../../../commands/fileCommands";
import { resolveTabIdsToCloseAfterDelete, isDeletedPathDirectory } from "./rightPaneDelete";

type FileTreeUndoAction =
  | { kind: "create-file"; path: string }
  | { kind: "create-folder"; path: string }
  | { kind: "rename"; fromPath: string; toPath: string }
  | { kind: "move"; entries: { fromPath: string; toPath: string }[] }
  | { kind: "delete-file"; path: string; content: string };

export type { FileTreeUndoAction };

type UseFileTreeUndoInput = {
  selectedWorkspaceWorktreePath: string | undefined;
  selectedWorkspaceId: string | undefined;
  tabs: WorkspaceTab[];
  closeTab: (tabId: string) => void;
  renameTabsForEntryRename: (workspaceId: string, fromPath: string, toPath: string) => void;
  loadAllRepoFiles: () => Promise<string[]>;
  setFileOperationError: (error: string | null) => void;
  getFileOperationErrorMessage: (error: unknown) => string;
  undoStack: FileTreeUndoAction[];
  setUndoStack: React.Dispatch<React.SetStateAction<FileTreeUndoAction[]>>;
};

export function useFileTreeUndo({
  selectedWorkspaceWorktreePath,
  selectedWorkspaceId,
  tabs,
  closeTab,
  renameTabsForEntryRename,
  loadAllRepoFiles,
  setFileOperationError,
  getFileOperationErrorMessage,
  undoStack,
  setUndoStack,
}: UseFileTreeUndoInput) {
  const isApplyingUndoRef = useRef(false);

  const pushUndoAction = useCallback((action: FileTreeUndoAction) => {
    if (isApplyingUndoRef.current) {
      return;
    }

    setUndoStack((currentStack) => [action, ...currentStack].slice(0, 30));
  }, [setUndoStack]);

  const handleUndoLastFileTreeOperation = useCallback(async () => {
    if (isApplyingUndoRef.current) {
      return;
    }

    const latestUndoAction = undoStack[0];
    if (!latestUndoAction || !selectedWorkspaceWorktreePath) {
      return;
    }

    try {
      isApplyingUndoRef.current = true;
      setFileOperationError(null);

      switch (latestUndoAction.kind) {
        case "create-file": {
          await deleteEntry({
            workspaceId: selectedWorkspaceId ?? "",
            relativePath: latestUndoAction.path,
          });

          const tabIdsToClose = resolveTabIdsToCloseAfterDelete(tabs, latestUndoAction.path, false);
          for (const tabId of tabIdsToClose) {
            closeTab(tabId);
          }
          break;
        }
        case "create-folder": {
          await deleteEntry({
            workspaceId: selectedWorkspaceId ?? "",
            relativePath: latestUndoAction.path,
          });

          const tabIdsToClose = resolveTabIdsToCloseAfterDelete(tabs, latestUndoAction.path, true);
          for (const tabId of tabIdsToClose) {
            closeTab(tabId);
          }
          break;
        }
        case "rename": {
          await renameEntry({
            workspaceId: selectedWorkspaceId ?? "",
            fromRelativePath: latestUndoAction.toPath,
            toRelativePath: latestUndoAction.fromPath,
          });
          renameTabsForEntryRename(selectedWorkspaceId ?? "", latestUndoAction.toPath, latestUndoAction.fromPath);
          break;
        }
        case "move": {
          const reverseEntries = [...latestUndoAction.entries].sort(
            (leftEntry, rightEntry) => rightEntry.toPath.length - leftEntry.toPath.length,
          );

          for (const reverseEntry of reverseEntries) {
            await renameEntry({
              workspaceId: selectedWorkspaceId ?? "",
              fromRelativePath: reverseEntry.toPath,
              toRelativePath: reverseEntry.fromPath,
            });
          }
          break;
        }
        case "delete-file": {
          await createFile({
            workspaceId: selectedWorkspaceId ?? "",
            relativePath: latestUndoAction.path,
            content: latestUndoAction.content,
          });
          break;
        }
        default: {
          const exhaustiveCheck: never = latestUndoAction;
          return exhaustiveCheck;
        }
      }

      await loadAllRepoFiles();
      setUndoStack((currentStack) => currentStack.slice(1));
    } catch (error) {
      setFileOperationError(getFileOperationErrorMessage(error));
      console.error("Failed to undo file tree operation", error);
    } finally {
      isApplyingUndoRef.current = false;
    }
  }, [
    closeTab,
    loadAllRepoFiles,
    renameTabsForEntryRename,
    selectedWorkspaceId,
    selectedWorkspaceWorktreePath,
    setFileOperationError,
    setUndoStack,
    tabs,
    undoStack,
    getFileOperationErrorMessage,
  ]);

  return {
    pushUndoAction,
    handleUndoLastFileTreeOperation,
    isApplyingUndoRef,
  };
}
