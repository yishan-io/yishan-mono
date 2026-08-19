import { useCallback, useState } from "react";
import type { DragEvent } from "react";
import {
  FILETREE_DRAG_MIME,
  extractInternalDragRelativePaths,
  extractSourcePathsFromDataTransferAsync,
  hasExternalFileDragIntent,
  hasInternalFileTreeDragIntent,
} from "./dataTransfer";
import type { FileTreeDragEntry } from "./dataTransfer";
import { resolveDestinationDirectoryPath } from "./treeUtils";
import type { VisibleRow } from "./types";

type UseFileTreeDragDropInput = {
  worktreePath?: string;
  onDropExternalEntries?: (sourcePaths: string[], destinationPath: string) => void | Promise<void>;
  onMoveEntries?: (sourceRelativePaths: string[], destinationPath: string) => void | Promise<void>;
  selectedPaths?: Set<string>;
  rowByPath?: Map<string, { row: VisibleRow; index: number }>;
};

export type UseFileTreeDragDropResult = {
  dropTargetPath: string | null;
  handleRowDragStart: (event: DragEvent<HTMLElement>, row: VisibleRow, absolutePath: string) => void;
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
  selectedPaths,
  rowByPath,
}: UseFileTreeDragDropInput): UseFileTreeDragDropResult {
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  const handleRowDragStart = useCallback(
    (event: DragEvent<HTMLElement>, row: VisibleRow, absolutePath: string) => {
      event.dataTransfer.effectAllowed = "copyMove";
      const isRowInMultiSelect = Boolean(selectedPaths?.has(row.path)) && (selectedPaths?.size ?? 0) > 1;

      if (isRowInMultiSelect && selectedPaths && worktreePath && rowByPath) {
        const entries: FileTreeDragEntry[] = [...selectedPaths].map((p) => {
          const meta = rowByPath.get(p);
          return { path: `${worktreePath}/${p}`, isDirectory: meta?.row.isDirectory ?? false };
        });
        event.dataTransfer.setData(FILETREE_DRAG_MIME, JSON.stringify(entries));
        event.dataTransfer.setData("text/plain", entries.map((e) => e.path).join("\n"));
      } else {
        event.dataTransfer.setData(
          FILETREE_DRAG_MIME,
          JSON.stringify([{ path: absolutePath, isDirectory: row.isDirectory }]),
        );
        event.dataTransfer.setData("text/plain", absolutePath);
      }
    },
    [rowByPath, selectedPaths, worktreePath],
  );

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
    handleRowDragStart,
    handleExternalDragOver,
    handleRowDragEnter,
    handleRowDragLeave,
    handleExternalDrop,
    clearDropTarget,
  };
}
