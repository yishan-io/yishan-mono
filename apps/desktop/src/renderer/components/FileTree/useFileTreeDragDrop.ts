import { useCallback, useState } from "react";
import type { DragEvent } from "react";
import {
  extractInternalDragRelativePaths,
  extractSourcePathsFromDataTransferAsync,
  hasExternalFileDragIntent,
  hasInternalFileTreeDragIntent,
} from "./dataTransfer";
import { resolveDestinationDirectoryPath } from "./treeUtils";

type UseFileTreeDragDropInput = {
  worktreePath?: string;
  onDropExternalEntries?: (sourcePaths: string[], destinationPath: string) => void | Promise<void>;
  onMoveEntries?: (sourceRelativePaths: string[], destinationPath: string) => void | Promise<void>;
};

export type UseFileTreeDragDropResult = {
  dropTargetPath: string | null;
  handleExternalDragOver: (event: DragEvent<HTMLElement>) => void;
  handleRowDragEnter: (event: DragEvent<HTMLElement>, targetPath: string, targetIsDirectory: boolean) => void;
  handleRowDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleExternalDrop: (event: DragEvent<HTMLElement>, targetPath: string, targetIsDirectory: boolean) => Promise<void>;
  clearDropTarget: () => void;
};

/**
 * Manages drag-and-drop state and handlers for the file tree.
 * Handles both internal (move) and external (import) drag operations.
 */
export function useFileTreeDragDrop({
  worktreePath,
  onDropExternalEntries,
  onMoveEntries,
}: UseFileTreeDragDropInput): UseFileTreeDragDropResult {
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  const handleExternalDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (onMoveEntries && hasInternalFileTreeDragIntent(event)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        return;
      }

      if (!onDropExternalEntries || !hasExternalFileDragIntent(event)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [onDropExternalEntries, onMoveEntries],
  );

  const handleRowDragEnter = useCallback(
    (event: DragEvent<HTMLElement>, targetPath: string, targetIsDirectory: boolean) => {
      const destinationPath = resolveDestinationDirectoryPath(targetPath, targetIsDirectory);

      if (onMoveEntries && hasInternalFileTreeDragIntent(event)) {
        setDropTargetPath(destinationPath);
        return;
      }

      if (onDropExternalEntries && hasExternalFileDragIntent(event)) {
        setDropTargetPath(destinationPath);
      }
    },
    [onDropExternalEntries, onMoveEntries],
  );

  const handleRowDragLeave = useCallback((_event: DragEvent<HTMLElement>) => {
    // Drop target is updated by next dragEnter or cleared on drop/container-dragLeave.
  }, []);

  const handleExternalDrop = useCallback(
    async (event: DragEvent<HTMLElement>, targetPath: string, targetIsDirectory: boolean) => {
      setDropTargetPath(null);

      const destinationPath = resolveDestinationDirectoryPath(targetPath, targetIsDirectory);

      if (onMoveEntries && hasInternalFileTreeDragIntent(event) && worktreePath) {
        event.preventDefault();
        event.stopPropagation();

        const sourcePaths = extractInternalDragRelativePaths(event.dataTransfer, worktreePath);
        if (sourcePaths.length === 0) {
          return;
        }

        const isInvalidTarget = sourcePaths.some(
          (srcPath) => srcPath === destinationPath || destinationPath.startsWith(`${srcPath}/`),
        );
        if (isInvalidTarget) {
          return;
        }

        await onMoveEntries(sourcePaths, destinationPath);
        return;
      }

      if (!onDropExternalEntries) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const sourcePaths = await extractSourcePathsFromDataTransferAsync(event.dataTransfer);
      if (sourcePaths.length === 0) {
        return;
      }

      await onDropExternalEntries(sourcePaths, destinationPath);
    },
    [onDropExternalEntries, onMoveEntries, worktreePath],
  );

  const clearDropTarget = useCallback(() => {
    setDropTargetPath(null);
  }, []);

  return {
    dropTargetPath,
    handleExternalDragOver,
    handleRowDragEnter,
    handleRowDragLeave,
    handleExternalDrop,
    clearDropTarget,
  };
}
