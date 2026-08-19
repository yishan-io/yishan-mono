import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectAncestorDirectoryPaths } from "./treeUtils";
import type { FileTreeProps, VisibleRow } from "./types";

type RowByPath = Map<string, { row: VisibleRow; index: number }>;

type UseFileTreeSelectionInput = {
  rowByPath: RowByPath;
  selectionRequest?: FileTreeProps["selectionRequest"];
  visibleRows: VisibleRow[];
  onEnsurePathLoaded?: FileTreeProps["onEnsurePathLoaded"];
  onSelectEntry?: FileTreeProps["onSelectEntry"];
  onSelectionChange?: (paths: string[]) => void;
  directoryPaths: Set<string>;
  setExpandedItems: (updater: (currentItems: string[]) => string[]) => void;
};

type UseFileTreeSelectionResult = {
  selectedPaths: Set<string>;
  focusedPath: string;
  handleRowClick: (path: string, row: VisibleRow, modifiers: { meta: boolean }) => void;
  clearToSingle: (path: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  selectFirstTreeEntryOnFocus: () => void;
};

/** Manages file-tree selection state and external selection requests. */
export function useFileTreeSelection({
  rowByPath,
  selectionRequest,
  visibleRows,
  onEnsurePathLoaded,
  onSelectEntry,
  onSelectionChange,
  directoryPaths,
  setExpandedItems,
}: UseFileTreeSelectionInput): UseFileTreeSelectionResult {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [focusedPath, setFocusedPath] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastAppliedSelectionRequestIdRef = useRef<number | null>(null);
  const requestedSelectionPath = selectionRequest?.path?.trim();

  const normalizedSelectionPath = useMemo(
    () => requestedSelectionPath?.replace(/\/+$/, "") ?? "",
    [requestedSelectionPath],
  );

  useEffect(() => {
    if (!selectionRequest || !normalizedSelectionPath) {
      return;
    }

    if (selectionRequest.requestId === lastAppliedSelectionRequestIdRef.current) {
      return;
    }

    const ancestorDirectoryPaths = collectAncestorDirectoryPaths(normalizedSelectionPath);
    if (ancestorDirectoryPaths.length > 0) {
      setExpandedItems((currentItems) => [...new Set([...currentItems, ...ancestorDirectoryPaths])]);
    }

    const requestedRow = rowByPath.get(normalizedSelectionPath);
    const pathToLoad = requestedRow
      ? requestedRow.row.isDirectory
        ? normalizedSelectionPath
        : normalizedSelectionPath.split("/").slice(0, -1).join("/")
      : normalizedSelectionPath.split("/").slice(0, -1).join("/") || normalizedSelectionPath;
    if (pathToLoad) {
      void onEnsurePathLoaded?.(pathToLoad);
    }

    if (!rowByPath.has(normalizedSelectionPath)) {
      return;
    }

    setSelectedPaths(new Set([normalizedSelectionPath]));
    setFocusedPath(normalizedSelectionPath);
    if (selectionRequest.focus) {
      scrollRef.current?.focus();
    }
    lastAppliedSelectionRequestIdRef.current = selectionRequest.requestId;
  }, [normalizedSelectionPath, onEnsurePathLoaded, rowByPath, selectionRequest, setExpandedItems]);

  const handleRowClick = useCallback(
    (path: string, row: VisibleRow, modifiers: { meta: boolean }) => {
      if (!modifiers.meta) {
        setSelectedPaths(new Set([path]));
        setFocusedPath(path);
        onSelectEntry?.({ path, isDirectory: row.isDirectory });
        onSelectionChange?.([path]);
      } else {
        const nextSet = new Set(selectedPaths);
        if (nextSet.has(path)) {
          nextSet.delete(path);
        } else {
          nextSet.add(path);
        }
        setSelectedPaths(nextSet);
        setFocusedPath(path);
        onSelectEntry?.({ path, isDirectory: row.isDirectory, isMultiSelectOperation: true });
        onSelectionChange?.([...nextSet]);
      }
    },
    [onSelectEntry, onSelectionChange, selectedPaths],
  );

  const clearToSingle = useCallback(
    (path: string) => {
      setSelectedPaths(new Set([path]));
      setFocusedPath(path);
      onSelectEntry?.({ path, isDirectory: directoryPaths.has(path) });
      onSelectionChange?.([path]);
    },
    [directoryPaths, onSelectEntry, onSelectionChange],
  );

  const selectFirstTreeEntryOnFocus = useCallback(() => {
    if (focusedPath || normalizedSelectionPath) {
      return;
    }

    const firstRow = visibleRows[0];
    if (!firstRow) {
      return;
    }

    handleRowClick(firstRow.path, firstRow, { meta: false });
  }, [focusedPath, handleRowClick, normalizedSelectionPath, visibleRows]);

  return {
    selectedPaths,
    focusedPath,
    handleRowClick,
    clearToSingle,
    scrollRef,
    selectFirstTreeEntryOnFocus,
  };
}
