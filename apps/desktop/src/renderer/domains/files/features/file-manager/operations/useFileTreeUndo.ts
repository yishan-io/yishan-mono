import { createFile, deleteEntry, renameEntry } from "@renderer/domains/files/commands/fileCommands";
import type { WorkbenchTab } from "@renderer/domains/workbench";
import { useCallback, useRef } from "react";
import { resolveTabIdsToCloseAfterDelete } from "../rightPaneDelete";

type FileTreeUndoAction =
  | { kind: "create-file"; path: string }
  | { kind: "create-folder"; path: string }
  | { kind: "rename"; fromPath: string; toPath: string }
  | { kind: "move"; entries: { fromPath: string; toPath: string }[] }
  | { kind: "delete-file"; path: string; content: string };

export type { FileTreeUndoAction };

const alwaysCurrent = () => true;

type UseFileTreeUndoInput = {
  isCurrentListing?: () => boolean;
  selectedWorkspaceWorktreePath: string | undefined;
  selectedWorkspaceId: string | undefined;
  tabs: WorkbenchTab[];
  closeTab: (tabId: string) => void;
  renameTabsForEntryRename: (workspaceId: string, fromPath: string, toPath: string) => void;
  loadAllRepoFiles: () => Promise<string[]>;
  setFileOperationError: (error: string | null) => void;
  getFileOperationErrorMessage: (error: unknown) => string;
  undoStack: FileTreeUndoAction[];
  setUndoStack: React.Dispatch<React.SetStateAction<FileTreeUndoAction[]>>;
};

export function useFileTreeUndo({
  isCurrentListing = alwaysCurrent,
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

  const pushUndoAction = useCallback(
    (action: FileTreeUndoAction) => {
      if (!isCurrentListing() || isApplyingUndoRef.current) {
        return;
      }

      setUndoStack((currentStack) => [action, ...currentStack].slice(0, 30));
    },
    [isCurrentListing, setUndoStack],
  );

  const handleUndoLastFileTreeOperation = useCallback(async () => {
    if (!isCurrentListing() || isApplyingUndoRef.current) {
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
          if (!isCurrentListing()) return;

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
          if (!isCurrentListing()) return;

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
          if (!isCurrentListing()) return;
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
            if (!isCurrentListing()) return;
          }
          break;
        }
        case "delete-file": {
          await createFile({
            workspaceId: selectedWorkspaceId ?? "",
            relativePath: latestUndoAction.path,
            content: latestUndoAction.content,
          });
          if (!isCurrentListing()) return;
          break;
        }
        default: {
          const exhaustiveCheck: never = latestUndoAction;
          return exhaustiveCheck;
        }
      }

      await loadAllRepoFiles();
      if (!isCurrentListing()) return;
      setUndoStack((currentStack) => currentStack.slice(1));
    } catch (error) {
      if (!isCurrentListing()) return;
      setFileOperationError(getFileOperationErrorMessage(error));
      console.error("Failed to undo file tree operation", error);
    } finally {
      isApplyingUndoRef.current = false;
    }
  }, [
    isCurrentListing,
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
