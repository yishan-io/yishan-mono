import { useCallback } from "react";
import type React from "react";
import { isEditableTarget } from "../../shortcuts/editableTarget";
import { extractSourcePathsFromDataTransferAsync } from "./dataTransfer";
import { resolveDestinationDirectoryPath } from "./treeUtils";
import type { EditingEntry, FileTreeProps } from "./types";

type UseFileTreeExternalPasteInput = {
  focusedPath: string;
  directoryPaths: Set<string>;
  editingEntry: EditingEntry | null;
  onDropExternalEntries?: FileTreeProps["onDropExternalEntries"];
};

export function useFileTreeExternalPaste({
  focusedPath,
  directoryPaths,
  editingEntry,
  onDropExternalEntries,
}: UseFileTreeExternalPasteInput): {
  handleExternalPaste: (event: React.ClipboardEvent<HTMLElement>) => Promise<void>;
} {
  const handleExternalPaste = useCallback(
    async (event: React.ClipboardEvent<HTMLElement>) => {
      if (!onDropExternalEntries || editingEntry || isEditableTarget(event.target)) {
        return;
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }

      const sourcePaths = await extractSourcePathsFromDataTransferAsync(clipboardData);
      if (sourcePaths.length === 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      await onDropExternalEntries(
        sourcePaths,
        resolveDestinationDirectoryPath(focusedPath, directoryPaths.has(focusedPath)),
      );
    },
    [directoryPaths, editingEntry, focusedPath, onDropExternalEntries],
  );

  return { handleExternalPaste };
}
