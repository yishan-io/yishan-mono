import { Box } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ClipboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { isEditableTarget } from "../../shortcuts/editableTarget";
import { FileTreeRows } from "./FileTreeRows";
import { ROW_HEIGHT } from "./FlatTreeRow";
import { extractSourcePathsFromDataTransferAsync } from "./dataTransfer";
import { collectAncestorDirectoryPaths, resolveDestinationDirectoryPath } from "./treeUtils";
import type { FileTreeGitChangeKind, FileTreeProps, VisibleRow } from "./types";
import { useFileTreeDragDrop } from "./useFileTreeDragDrop";
import { useFileTreeEditing } from "./useFileTreeEditing";
import { useFileTreeKeyboard } from "./useFileTreeKeyboard";
import { useFileTreeSelection } from "./useFileTreeSelection";
import { useVisibleFileTree } from "./useVisibleFileTree";

const EMPTY_IGNORED_PATHS: string[] = [];
const EMPTY_GIT_CHANGES_BY_PATH: Record<string, FileTreeGitChangeKind> = {};

export function FileTree({
  files,
  gitChangesByPath,
  ignoredPaths = EMPTY_IGNORED_PATHS,
  expandedItems: expandedItemsOverride,
  worktreePath,
  selectionRequest,
  createEntryRequest,
  onSelectEntry,
  onOpenEntry,
  onExpandedItemsChange,
  onEnsurePathLoaded,
  onCreateEntry,
  onRenameEntry,
  onDeleteEntry,
  onCopyEntry,
  onCutEntry,
  onPasteEntries,
  canPasteEntries,
  onUndoLastEntryOperation,
  canUndoLastEntryOperation,
  onDropExternalEntries,
  onMoveEntries,
  onItemContextMenu,
}: FileTreeProps) {
  const gitChangesByPathResolved = gitChangesByPath ?? EMPTY_GIT_CHANGES_BY_PATH;
  const ancestorOfGitChangePaths = useMemo(() => {
    const set = new Set<string>();
    for (const path of Object.keys(gitChangesByPathResolved)) {
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) {
        set.add(parts.slice(0, i).join("/"));
      }
    }
    return set;
  }, [gitChangesByPathResolved]);
  const ignoredPathSet = useMemo(
    () => new Set(ignoredPaths.map((path) => path.replace(/\/+$/, "")).filter(Boolean)),
    [ignoredPaths],
  );

  const {
    editingEntry,
    editingName,
    setEditingName,
    editingInputRef,
    didApplyInitialSelectionRef,
    startCreate,
    startRename,
    handleRenameInputKeyDown,
    handleRenameInputBlur,
  } = useFileTreeEditing({
    files,
    onCreateEntry,
    onRenameEntry,
  });

  const { visibleRows, directoryPaths, expandedItems, setExpandedItems } = useVisibleFileTree({
    files,
    ignoredPathSet,
    editingEntry,
    expandedItemsOverride,
    onExpandedItemsChange,
  });

  const rowByPath = useMemo(() => {
    const map = new Map<string, { row: VisibleRow; index: number }>();
    for (let i = 0; i < visibleRows.length; i++) {
      const row = visibleRows[i];
      if (row) {
        map.set(row.path, { row, index: i });
      }
    }
    return map;
  }, [visibleRows]);

  const { selectedEntryPath, setSelectedEntryPath, scrollRef, selectFirstTreeEntryOnFocus } = useFileTreeSelection({
    rowByPath,
    selectionRequest,
    visibleRows,
    onEnsurePathLoaded,
    onSelectEntry,
    setExpandedItems,
  });

  const lastAppliedCreateRequestIdRef = useRef<number | null>(null);
  const expandedPathSet = useMemo(() => new Set(expandedItems), [expandedItems]);
  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const handleStartCreate = useCallback(
    (basePath: string, isDirectory: boolean) => {
      if (basePath) {
        setExpandedItems((currentItems) => [
          ...new Set([...currentItems, ...collectAncestorDirectoryPaths(basePath), basePath]),
        ]);
      }

      startCreate(basePath, isDirectory);
    },
    [setExpandedItems, startCreate],
  );

  const {
    dropTargetPath,
    handleExternalDragOver,
    handleRowDragEnter,
    handleRowDragLeave,
    handleExternalDrop,
    clearDropTarget,
  } = useFileTreeDragDrop({ worktreePath, onDropExternalEntries, onMoveEntries });

  useEffect(() => {
    if (!createEntryRequest) {
      return;
    }

    if (createEntryRequest.requestId === lastAppliedCreateRequestIdRef.current) {
      return;
    }

    handleStartCreate(createEntryRequest.basePath ?? "", createEntryRequest.kind === "folder");
    lastAppliedCreateRequestIdRef.current = createEntryRequest.requestId;
  }, [createEntryRequest, handleStartCreate]);

  useEffect(() => {
    if (!editingEntry?.path || !editingInputRef.current) {
      didApplyInitialSelectionRef.current = false;
      return;
    }

    if (didApplyInitialSelectionRef.current) {
      return;
    }

    const input = editingInputRef.current;
    const lastDotIndex = editingName.lastIndexOf(".");
    const selectionEnd = lastDotIndex > 0 ? lastDotIndex : editingName.length;
    input.focus();
    input.setSelectionRange(0, selectionEnd);
    didApplyInitialSelectionRef.current = true;
  }, [didApplyInitialSelectionRef, editingEntry, editingInputRef, editingName]);

  const handleExternalPaste = useCallback(
    async (event: ClipboardEvent<HTMLElement>) => {
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
        resolveDestinationDirectoryPath(selectedEntryPath, directoryPaths.has(selectedEntryPath)),
      );
    },
    [directoryPaths, editingEntry, onDropExternalEntries, selectedEntryPath],
  );

  const { handleTreeKeyDown } = useFileTreeKeyboard({
    visibleRows,
    rowByPath,
    selectedEntryPath,
    editingEntry,
    expandedItems,
    expandedPathSet,
    directoryPaths,
    canPasteEntries,
    canUndoLastEntryOperation,
    virtualizer,
    setSelectedEntryPath,
    setExpandedItems,
    onSelectEntry,
    onOpenEntry,
    onCopyEntry,
    onCutEntry,
    onPasteEntries,
    onDeleteEntry,
    onUndoLastEntryOperation,
  });

  return (
    <Box
      ref={scrollRef}
      data-testid="repo-file-tree-area"
      sx={{
        flex: 1,
        minHeight: 0,
        px: 1.5,
        py: 1,
        overflowY: "auto",
        overflowX: "auto",
        ...(dropTargetPath === "" && {
          outline: "1.5px dashed",
          outlineColor: "primary.main",
          outlineOffset: "-1.5px",
          borderRadius: 1,
        }),
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onItemContextMenu?.({
          mouseX: event.clientX,
          mouseY: event.clientY,
          basePath: "",
          targetPath: "",
          targetIsDirectory: false,
          startCreateFile: () => handleStartCreate("", false),
          startCreateFolder: () => handleStartCreate("", true),
        });
      }}
      onKeyDown={(event) => {
        void handleTreeKeyDown(event);
      }}
      onDragOver={handleExternalDragOver}
      onDragLeave={(event) => {
        const relatedTarget = event.relatedTarget as Node | null;
        if (!scrollRef.current?.contains(relatedTarget)) {
          clearDropTarget();
        }
      }}
      onDrop={(event) => {
        void handleExternalDrop(event, "", true);
      }}
      onPaste={(event) => {
        void handleExternalPaste(event);
      }}
      onFocus={selectFirstTreeEntryOnFocus}
      tabIndex={0}
    >
      <FileTreeRows
        visibleRows={visibleRows}
        virtualizer={virtualizer}
        expandedPathSet={expandedPathSet}
        selectedEntryPath={selectedEntryPath}
        ignoredPathSet={ignoredPathSet}
        gitChangesByPath={gitChangesByPathResolved}
        ancestorOfGitChangePaths={ancestorOfGitChangePaths}
        editingEntry={editingEntry}
        editingName={editingName}
        editingInputRef={editingInputRef}
        worktreePath={worktreePath}
        dropTargetPath={dropTargetPath}
        setSelectedEntryPath={setSelectedEntryPath}
        setExpandedItems={setExpandedItems}
        onSelectEntry={onSelectEntry}
        onOpenEntry={onOpenEntry}
        onEnsurePathLoaded={onEnsurePathLoaded}
        onItemContextMenu={onItemContextMenu}
        onRenameEntry={onRenameEntry}
        startCreate={handleStartCreate}
        startRename={startRename}
        setEditingName={setEditingName}
        handleRenameInputKeyDown={handleRenameInputKeyDown}
        handleRenameInputBlur={handleRenameInputBlur}
        handleExternalDragOver={handleExternalDragOver}
        handleRowDragEnter={handleRowDragEnter}
        handleRowDragLeave={handleRowDragLeave}
        handleExternalDrop={handleExternalDrop}
      />
    </Box>
  );
}
