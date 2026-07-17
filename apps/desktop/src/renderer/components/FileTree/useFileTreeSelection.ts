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
  setExpandedItems: (updater: (currentItems: string[]) => string[]) => void;
};

type UseFileTreeSelectionResult = {
  selectedEntryPath: string;
  setSelectedEntryPath: (path: string) => void;
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
  setExpandedItems,
}: UseFileTreeSelectionInput): UseFileTreeSelectionResult {
  const [selectedEntryPath, setSelectedEntryPath] = useState("");
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

    setSelectedEntryPath(normalizedSelectionPath);
    if (selectionRequest.focus) {
      scrollRef.current?.focus();
    }
    lastAppliedSelectionRequestIdRef.current = selectionRequest.requestId;
  }, [normalizedSelectionPath, onEnsurePathLoaded, rowByPath, selectionRequest, setExpandedItems]);

  const selectFirstTreeEntryOnFocus = useCallback(() => {
    if (selectedEntryPath || normalizedSelectionPath) {
      return;
    }

    const firstRow = visibleRows[0];
    if (!firstRow) {
      return;
    }

    setSelectedEntryPath(firstRow.path);
    onSelectEntry?.({ path: firstRow.path, isDirectory: firstRow.isDirectory });
  }, [normalizedSelectionPath, onSelectEntry, selectedEntryPath, visibleRows]);

  return {
    selectedEntryPath,
    setSelectedEntryPath,
    scrollRef,
    selectFirstTreeEntryOnFocus,
  };
}
