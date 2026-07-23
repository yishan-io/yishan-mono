import type { DragEvent } from "react";
import { useCallback, useRef, useState } from "react";
import {
  type FileTreeDragEntry,
  extractSourcePathsFromDataTransfer,
  hasExternalFileDragIntent,
  hasInternalFileTreeDragIntent,
  resolveInternalFileTreeDragEntries,
} from "./FileTree/dataTransfer";

type UseComposerFileDropOptions = {
  onFilesDrop?: (entries: FileTreeDragEntry[]) => void;
};

type UseComposerFileDropResult = {
  isDragOver: boolean;
  handleDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  handleDragLeave: () => void;
  handleDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handleDrop: (event: DragEvent<HTMLDivElement>) => void;
};

/** Manages file drag-and-drop for a composer element, including visual drag-over feedback. */
export function useComposerFileDrop({ onFilesDrop }: UseComposerFileDropOptions): UseComposerFileDropResult {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragEnterCountRef = useRef(0);

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!onFilesDrop) return;
      if (!hasInternalFileTreeDragIntent(event) && !hasExternalFileDragIntent(event)) return;
      event.preventDefault();
      dragEnterCountRef.current += 1;
      if (dragEnterCountRef.current === 1) setIsDragOver(true);
    },
    [onFilesDrop],
  );

  const handleDragLeave = useCallback(() => {
    dragEnterCountRef.current = Math.max(0, dragEnterCountRef.current - 1);
    if (dragEnterCountRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!onFilesDrop) return;
      if (!hasInternalFileTreeDragIntent(event) && !hasExternalFileDragIntent(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    },
    [onFilesDrop],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      dragEnterCountRef.current = 0;
      setIsDragOver(false);
      if (!onFilesDrop || !event.dataTransfer) return;
      if (!hasInternalFileTreeDragIntent(event) && !hasExternalFileDragIntent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const dt = event.dataTransfer;
      // Extract external paths synchronously before any async suspension
      const externalPaths = extractSourcePathsFromDataTransfer(dt);
      const internalEntries = await resolveInternalFileTreeDragEntries(dt);
      const finalEntries: FileTreeDragEntry[] =
        internalEntries.length > 0 ? internalEntries : externalPaths.map((path) => ({ path, isDirectory: false }));
      if (finalEntries.length > 0) onFilesDrop(finalEntries);
    },
    [onFilesDrop],
  );

  return { isDragOver, handleDragEnter, handleDragLeave, handleDragOver, handleDrop };
}
