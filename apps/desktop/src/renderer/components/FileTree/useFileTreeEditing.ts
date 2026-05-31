import { useCallback, useRef, useState } from "react";
import { collectAncestorDirectoryPaths, getEntryName, joinChildPath, resolveUniqueChildName } from "./treeUtils";
import type { EditingEntry } from "./types";

type UseFileTreeEditingInput = {
  files: string[];
  onCreateEntry?: (entry: { path: string; isDirectory: boolean }) => void | Promise<void>;
  onRenameEntry?: (path: string, nextName: string) => void | Promise<void>;
  setExpandedItems: (updater: (currentItems: string[]) => string[]) => void;
};

export type UseFileTreeEditingResult = {
  editingEntry: EditingEntry | null;
  editingName: string;
  setEditingName: (name: string) => void;
  editingInputRef: React.RefObject<HTMLInputElement | null>;
  ignoreRenameBlurUntilRef: React.MutableRefObject<number>;
  didApplyInitialSelectionRef: React.MutableRefObject<boolean>;
  cancelRename: () => void;
  commitRename: () => Promise<void>;
  startCreate: (basePath: string, isDirectory: boolean) => void;
  startRename: (targetPath: string, basePath: string) => void;
  handleRenameInputKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  handleRenameInputBlur: () => void;
};

/**
 * Manages inline rename/create editing state for the file tree.
 * Handles input focus, name validation, commit/cancel lifecycle.
 */
export function useFileTreeEditing({
  files,
  onCreateEntry,
  onRenameEntry,
  setExpandedItems,
}: UseFileTreeEditingInput): UseFileTreeEditingResult {
  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [editingName, setEditingName] = useState("");
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  const ignoreRenameBlurUntilRef = useRef(0);
  const didApplyInitialSelectionRef = useRef(false);

  const cancelRename = useCallback(() => {
    setEditingEntry(null);
    setEditingName("");
    didApplyInitialSelectionRef.current = false;
  }, []);

  const commitRename = useCallback(async () => {
    if (!editingEntry) {
      cancelRename();
      return;
    }

    const nextName = editingName.trim();
    if (!nextName || nextName.includes("/") || nextName.includes("\\")) {
      cancelRename();
      return;
    }

    if (editingEntry.mode === "create") {
      const nextPath = joinChildPath(editingEntry.basePath, nextName);
      try {
        if (!onCreateEntry) {
          return;
        }

        await onCreateEntry({ path: nextPath, isDirectory: editingEntry.isDirectory });
      } finally {
        cancelRename();
      }
      return;
    }

    if (!onRenameEntry) {
      cancelRename();
      return;
    }

    const currentName = getEntryName(editingEntry.path);
    if (nextName === currentName) {
      cancelRename();
      return;
    }

    try {
      await onRenameEntry(editingEntry.path, nextName);
    } finally {
      cancelRename();
    }
  }, [cancelRename, editingEntry, editingName, onCreateEntry, onRenameEntry]);

  const startCreate = useCallback(
    (basePath: string, isDirectory: boolean) => {
      if (!onCreateEntry) {
        return;
      }

      const draftName = resolveUniqueChildName(files, basePath, isDirectory ? "new-folder" : "new-file");
      if (basePath) {
        setExpandedItems((currentItems) => [
          ...new Set([...currentItems, ...collectAncestorDirectoryPaths(basePath), basePath]),
        ]);
      }
      ignoreRenameBlurUntilRef.current = Date.now() + 150;
      didApplyInitialSelectionRef.current = false;
      setEditingEntry({
        mode: "create",
        path: joinChildPath(basePath, draftName),
        basePath,
        isDirectory,
      });
      setEditingName("");
    },
    [files, onCreateEntry, setExpandedItems],
  );

  const startRename = useCallback(
    (targetPath: string, basePath: string) => {
      if (!targetPath || !onRenameEntry) {
        return;
      }

      ignoreRenameBlurUntilRef.current = Date.now() + 150;
      didApplyInitialSelectionRef.current = false;
      setEditingEntry({
        mode: "rename",
        path: targetPath,
        basePath,
        isDirectory: false,
      });
      setEditingName(getEntryName(targetPath));
    },
    [onRenameEntry],
  );

  const handleRenameInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void commitRename();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancelRename();
      }
    },
    [cancelRename, commitRename],
  );

  const handleRenameInputBlur = useCallback(() => {
    if (Date.now() < ignoreRenameBlurUntilRef.current) {
      return;
    }

    cancelRename();
  }, [cancelRename]);

  return {
    editingEntry,
    editingName,
    setEditingName,
    editingInputRef,
    ignoreRenameBlurUntilRef,
    didApplyInitialSelectionRef,
    cancelRename,
    commitRename,
    startCreate,
    startRename,
    handleRenameInputKeyDown,
    handleRenameInputBlur,
  };
}
