import type { Virtualizer } from "@tanstack/react-virtual";
import type { KeyboardEvent } from "react";
import { isEditableTarget } from "../../shortcuts/editableTarget";
import { handleFileTreeShortcutFromRegistry } from "../fileTreeActionRegistry";
import { resolveDestinationDirectoryPath } from "./treeUtils";
import type { EditingEntry, FileTreeProps, VisibleRow } from "./types";

type RowByPath = Map<string, { row: VisibleRow; index: number }>;

type UseFileTreeKeyboardOptions = {
  visibleRows: VisibleRow[];
  rowByPath: RowByPath;
  selectedEntryPath: string;
  selectedPaths: Set<string>;
  editingEntry: EditingEntry | null;
  expandedItems: string[];
  expandedPathSet: Set<string>;
  directoryPaths: Set<string>;
  canPasteEntries?: boolean;
  canUndoLastEntryOperation?: boolean;
  virtualizer: Pick<Virtualizer<HTMLDivElement, Element>, "scrollToIndex">;
  setSelectedEntryPath: (path: string) => void;
  setExpandedItems: (updater: (items: string[]) => string[]) => void;
  onOpenEntry?: FileTreeProps["onOpenEntry"];
  onCopyEntry?: FileTreeProps["onCopyEntry"];
  onCutEntry?: FileTreeProps["onCutEntry"];
  onPasteEntries?: FileTreeProps["onPasteEntries"];
  onDeleteEntry?: FileTreeProps["onDeleteEntry"];
  onUndoLastEntryOperation?: FileTreeProps["onUndoLastEntryOperation"];
};

/**
 * Returns a keyboard event handler for the file tree container that implements
 * arrow-key navigation, enter-to-open, and registered shortcut dispatch.
 */
export function useFileTreeKeyboard({
  visibleRows,
  rowByPath,
  selectedEntryPath,
  selectedPaths,
  editingEntry,
  expandedPathSet,
  directoryPaths,
  canPasteEntries,
  canUndoLastEntryOperation,
  virtualizer,
  setSelectedEntryPath,
  setExpandedItems,
  onOpenEntry,
  onCopyEntry,
  onCutEntry,
  onPasteEntries,
  onDeleteEntry,
  onUndoLastEntryOperation,
}: UseFileTreeKeyboardOptions) {
  const handleTreeKeyDown = async (event: KeyboardEvent<HTMLElement>) => {
    if (editingEntry || isEditableTarget(event.target)) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const current = rowByPath.get(selectedEntryPath);
      if (!current) {
        const firstRow = visibleRows[0];
        if (firstRow) {
          setSelectedEntryPath(firstRow.path);
          virtualizer.scrollToIndex(0, { align: "auto" });
        }
        return;
      }

      const nextRow = visibleRows[current.index + 1];
      if (nextRow) {
        setSelectedEntryPath(nextRow.path);
        virtualizer.scrollToIndex(current.index + 1, { align: "auto" });
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const current = rowByPath.get(selectedEntryPath);
      if (!current || current.index === 0) {
        return;
      }

      const prevRow = visibleRows[current.index - 1];
      if (prevRow) {
        setSelectedEntryPath(prevRow.path);
        virtualizer.scrollToIndex(current.index - 1, { align: "auto" });
      }
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const current = rowByPath.get(selectedEntryPath);
      if (current?.row.isDirectory) {
        if (!expandedPathSet.has(selectedEntryPath)) {
          setExpandedItems((items) => [...new Set([...items, selectedEntryPath])]);
        } else {
          const firstChild = visibleRows[current.index + 1];
          if (firstChild?.path.startsWith(`${selectedEntryPath}/`)) {
            setSelectedEntryPath(firstChild.path);
          }
        }
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const current = rowByPath.get(selectedEntryPath);
      if (current?.row.isDirectory && expandedPathSet.has(selectedEntryPath)) {
        setExpandedItems((items) => items.filter((item) => item !== selectedEntryPath));
      } else {
        const pathParts = selectedEntryPath.split("/").filter(Boolean);
        if (pathParts.length > 1) {
          const parentPath = pathParts.slice(0, -1).join("/");
          setSelectedEntryPath(parentPath);
        }
      }
      return;
    }

    // Only collapse multi-selection when more than one item is selected.
    // Escape on a single selection is a no-op to avoid the side effect of
    // clearToSingle firing onSelectEntry (which opens a file tab).
    if (event.key === "Escape" && selectedEntryPath && selectedPaths.size > 1) {
      event.preventDefault();
      setSelectedEntryPath(selectedEntryPath); // calls clearToSingle(focusedPath)
      return;
    }

    if (event.key === "Enter" && selectedEntryPath) {
      event.preventDefault();
      const current = rowByPath.get(selectedEntryPath);
      if (current?.row.isDirectory) {
        setExpandedItems((items) => {
          const isCurrentlyExpanded = items.includes(selectedEntryPath);
          return isCurrentlyExpanded
            ? items.filter((item) => item !== selectedEntryPath)
            : [...items, selectedEntryPath];
        });
      } else {
        await onOpenEntry?.({ path: selectedEntryPath, isDirectory: false });
      }
      return;
    }

    await handleFileTreeShortcutFromRegistry(
      {
        event,
        selectedEntryPath,
        canPasteEntries: Boolean(canPasteEntries),
        canUndoLastEntryOperation: Boolean(canUndoLastEntryOperation),
        onCopyEntry,
        onCutEntry,
        onPasteEntries,
        onDeleteEntry,
        // Note: keyboard Delete operates on focusedPath only, not the full
        // multi-selection. Bulk keyboard delete is intentionally out of scope.
        resolveSelectedPasteDestination: () =>
          resolveDestinationDirectoryPath(selectedEntryPath, directoryPaths.has(selectedEntryPath)),
      },
      [],
    );
  };

  return { handleTreeKeyDown };
}
