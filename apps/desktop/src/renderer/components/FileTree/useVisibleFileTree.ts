import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { buildTree, collectDirectoryPaths, collectExpandedItems, computeVisibleRows, sortNodes } from "./treeUtils";
import type { EditingEntry, VisibleRow } from "./types";

type UseVisibleFileTreeInput = {
  files: string[];
  ignoredPathSet: Set<string>;
  editingEntry: EditingEntry | null;
  expandedItemsOverride?: string[];
  onExpandedItemsChange?: (items: string[]) => void;
};

type UseVisibleFileTreeResult = {
  visibleRows: VisibleRow[];
  directoryPaths: Set<string>;
  expandedItems: string[];
  setExpandedItems: Dispatch<SetStateAction<string[]>>;
};

export function useVisibleFileTree({
  files,
  ignoredPathSet,
  editingEntry,
  expandedItemsOverride,
  onExpandedItemsChange,
}: UseVisibleFileTreeInput): UseVisibleFileTreeResult {
  const isControlled = expandedItemsOverride !== undefined;
  const createDraftPath = useMemo(() => {
    if (!editingEntry || editingEntry.mode !== "create") {
      return null;
    }

    return editingEntry.isDirectory ? `${editingEntry.path}/` : editingEntry.path;
  }, [editingEntry]);

  const editableFiles = useMemo(() => {
    if (!createDraftPath) {
      return files;
    }

    return [...files, createDraftPath];
  }, [createDraftPath, files]);
  const explicitDirectoryPathSet = useMemo(
    () => new Set(editableFiles.filter((path) => path.endsWith("/")).map((path) => path.replace(/\/+$/, ""))),
    [editableFiles],
  );

  const { defaultExpandedItems, directoryPaths } = useMemo(() => {
    const root = buildTree(editableFiles);
    const nodes = [...root.children.values()].sort(sortNodes);

    return {
      defaultExpandedItems: collectExpandedItems(nodes, ignoredPathSet, explicitDirectoryPathSet),
      directoryPaths: collectDirectoryPaths(nodes),
    };
  }, [editableFiles, explicitDirectoryPathSet, ignoredPathSet]);

  const [uncontrolledExpandedItems, setUncontrolledExpandedItems] = useState<string[]>(defaultExpandedItems);
  const expandedItems = isControlled ? expandedItemsOverride : uncontrolledExpandedItems;

  const setExpandedItems = useCallback<Dispatch<SetStateAction<string[]>>>(
    (input) => {
      const nextExpandedItems = typeof input === "function" ? input(expandedItems) : input;

      if (isControlled) {
        onExpandedItemsChange?.(nextExpandedItems);
        return;
      }

      setUncontrolledExpandedItems(nextExpandedItems);
    },
    [expandedItems, isControlled, onExpandedItemsChange],
  );

  useEffect(() => {
    // In controlled mode the parent owns expansion state entirely. The tree
    // must render from the provided expansion list without pruning it based on
    // temporarily incomplete directory data.
    if (isControlled) {
      return;
    }

    const nextExpandedItems = uncontrolledExpandedItems.filter((item) => directoryPaths.has(item));

    if (
      nextExpandedItems.length === uncontrolledExpandedItems.length &&
      nextExpandedItems.every((item, index) => item === uncontrolledExpandedItems[index])
    ) {
      return;
    }

    const finalExpandedItems =
      nextExpandedItems.length > 0 || defaultExpandedItems.length === 0 ? nextExpandedItems : defaultExpandedItems;

    setUncontrolledExpandedItems(finalExpandedItems);
  }, [defaultExpandedItems, directoryPaths, isControlled, uncontrolledExpandedItems]);

  const expandedPathSet = useMemo(() => new Set(expandedItems), [expandedItems]);

  const visibleRows = useMemo(
    () => computeVisibleRows(editableFiles, expandedPathSet),
    [editableFiles, expandedPathSet],
  );

  return {
    visibleRows,
    directoryPaths,
    expandedItems,
    setExpandedItems,
  };
}
