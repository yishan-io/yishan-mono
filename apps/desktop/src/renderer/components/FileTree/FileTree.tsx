import { Box } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ClipboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isEditableTarget } from "../../shortcuts/editableTarget";
import { FlatTreeRow } from "./FlatTreeRow";
import { ROW_HEIGHT } from "./FlatTreeRow";
import {
  extractSourcePathsFromDataTransferAsync,
} from "./dataTransfer";
import {
  collectAncestorDirectoryPaths,
  getEntryName,
  joinChildPath,
  resolveDestinationDirectoryPath,
  resolveUniqueChildName,
} from "./treeUtils";
import type {
  EditingEntry,
  FileTreeGitChangeKind,
  FileTreeProps,
  VisibleRow,
} from "./types";
import { useFileTreeDragDrop } from "./useFileTreeDragDrop";
import { useFileTreeKeyboard } from "./useFileTreeKeyboard";
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

  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [editingName, setEditingName] = useState("");
  const [selectedEntryPath, setSelectedEntryPath] = useState("");
  const ignoredPathSet = useMemo(
    () => new Set(ignoredPaths.map((path) => path.replace(/\/+$/, "")).filter(Boolean)),
    [ignoredPaths],
  );

  const { visibleRows, directoryPaths, expandedItems, setExpandedItems } = useVisibleFileTree({
    files,
    ignoredPathSet,
    editingEntry,
    expandedItemsOverride,
    onExpandedItemsChange,
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  const ignoreRenameBlurUntilRef = useRef(0);
  const didApplyInitialSelectionRef = useRef(false);
  const lastAppliedSelectionRequestIdRef = useRef<number | null>(null);
  const lastAppliedCreateRequestIdRef = useRef<number | null>(null);
  const expandedPathSet = useMemo(() => new Set(expandedItems), [expandedItems]);
  const {
    dropTargetPath,
    handleExternalDragOver,
    handleRowDragEnter,
    handleRowDragLeave,
    handleExternalDrop,
    clearDropTarget,
  } = useFileTreeDragDrop({ worktreePath, onDropExternalEntries, onMoveEntries });
  const rowByPath = useMemo(() => {
    const map = new Map<string, { row: VisibleRow; index: number }>();
    for (let i = 0; i < visibleRows.length; i++) {
      map.set(visibleRows[i]!.path, { row: visibleRows[i]!, index: i });
    }
    return map;
  }, [visibleRows]);

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // ─── Selection request effect ──────────────────────────────────────────────

  useEffect(() => {
    if (!selectionRequest) {
      return;
    }

    if (selectionRequest.requestId === lastAppliedSelectionRequestIdRef.current) {
      return;
    }

    const requestedPath = selectionRequest.path.trim().replace(/\/+$/, "");
    if (!requestedPath) {
      return;
    }

    const ancestorDirectoryPaths = collectAncestorDirectoryPaths(requestedPath);
    if (ancestorDirectoryPaths.length > 0) {
      setExpandedItems((currentItems) => [...new Set([...currentItems, ...ancestorDirectoryPaths])]);
    }

    void onEnsurePathLoaded?.(requestedPath);

    if (!rowByPath.has(requestedPath)) {
      return;
    }

    setSelectedEntryPath(requestedPath);
    if (selectionRequest.focus) {
      scrollRef.current?.focus();
    }
    lastAppliedSelectionRequestIdRef.current = selectionRequest.requestId;
  }, [onEnsurePathLoaded, rowByPath, selectionRequest, setExpandedItems]);

  // ─── Create entry request effect ──────────────────────────────────────────

  useEffect(() => {
    if (!createEntryRequest) {
      return;
    }

    if (createEntryRequest.requestId === lastAppliedCreateRequestIdRef.current) {
      return;
    }

    startCreate(createEntryRequest.basePath ?? "", createEntryRequest.kind === "folder");
    lastAppliedCreateRequestIdRef.current = createEntryRequest.requestId;
  }, [createEntryRequest]);

  // ─── Editing input auto-selection effect ──────────────────────────────────

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
  }, [editingEntry, editingName]);

  // ─── Rename handlers ──────────────────────────────────────────────────────

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

  // ─── External paste handler ────────────────────────────────────────────────

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

  // ─── Keyboard navigation ─────────────────────────────────────────────────

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

  const selectFirstTreeEntryOnFocus = useCallback(() => {
    if (selectedEntryPath) {
      return;
    }

    if (selectionRequest?.path?.trim()) {
      return;
    }

    const firstRow = visibleRows[0];
    if (!firstRow) {
      return;
    }

    setSelectedEntryPath(firstRow.path);
    onSelectEntry?.({ path: firstRow.path, isDirectory: firstRow.isDirectory });
  }, [onSelectEntry, selectedEntryPath, selectionRequest?.path, visibleRows]);

  // ─── Render ──────────────────────────────────────────────────────────────

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
        if (!onItemContextMenu) {
          return;
        }

        onItemContextMenu({
          mouseX: event.clientX,
          mouseY: event.clientY,
          basePath: "",
          targetPath: "",
          targetIsDirectory: false,
          startCreateFile: () => startCreate("", false),
          startCreateFolder: () => startCreate("", true),
        });
      }}
      onKeyDown={(event) => {
        void handleTreeKeyDown(event);
      }}
      onDragOver={handleExternalDragOver}
      onDragLeave={(event) => {
        const relatedTarget = event.relatedTarget as Node | null;
        if (!scrollRef.current?.contains(relatedTarget)) {
          setDropTargetPath(null);
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
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = visibleRows[virtualItem.index];
          if (!row) {
            return null;
          }

          const isExpanded = expandedPathSet.has(row.path);
          const isSelected = selectedEntryPath === row.path;
          const isIgnored = ignoredPathSet.has(row.path);
          const gitChangeKind = gitChangesByPathResolved[row.path];
          const isEditing = editingEntry?.path === row.path;
          const hasDescendantGitChange = row.isDirectory && ancestorOfGitChangePaths.has(row.path);

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <FlatTreeRow
                row={row}
                isSelected={isSelected}
                isEditing={isEditing}
                editingName={editingName}
                editingInputRef={editingInputRef}
                gitChangeKind={gitChangeKind}
                hasDescendantGitChange={hasDescendantGitChange}
                isIgnored={isIgnored}
                isExpanded={isExpanded}
                isLoading={loadingPaths.has(row.path)}
                isDraggable={Boolean(worktreePath)}
                absolutePath={worktreePath ? `${worktreePath}/${row.path}` : row.path}
                isDropTarget={dropTargetPath != null && row.isDirectory && row.path === dropTargetPath}
                onSelect={() => {
                  setSelectedEntryPath(row.path);
                  onSelectEntry?.({ path: row.path, isDirectory: row.isDirectory });
                }}
                onToggle={() => {
                  if (row.isDirectory) {
                    const isCurrentlyExpanded = expandedPathSet.has(row.path);
                    if (!isCurrentlyExpanded && onEnsurePathLoaded) {
                      const result = onEnsurePathLoaded(row.path);
                      if (result instanceof Promise) {
                        setLoadingPaths((prev) => new Set([...prev, row.path]));
                        result.finally(() => {
                          setLoadingPaths((prev) => {
                            const next = new Set(prev);
                            next.delete(row.path);
                            return next;
                          });
                        });
                      }
                    }
                  }
                  setExpandedItems((items) => {
                    const isCurrentlyExpanded = items.includes(row.path);
                    return isCurrentlyExpanded ? items.filter((item) => item !== row.path) : [...items, row.path];
                  });
                }}
                onOpen={() => {
                  if (row.isDirectory) {
                    if (onEnsurePathLoaded) {
                      const result = onEnsurePathLoaded(row.path);
                      if (result instanceof Promise) {
                        setLoadingPaths((prev) => new Set([...prev, row.path]));
                        result.finally(() => {
                          setLoadingPaths((prev) => {
                            const next = new Set(prev);
                            next.delete(row.path);
                            return next;
                          });
                        });
                      }
                    }
                    setExpandedItems((items) => [...new Set([...items, row.path])]);
                  } else {
                    onOpenEntry?.({ path: row.path, isDirectory: false });
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!onItemContextMenu) {
                    return;
                  }

                  setSelectedEntryPath(row.path);
                  const basePath = row.isDirectory ? row.path : row.path.split("/").slice(0, -1).join("/");
                  onItemContextMenu({
                    mouseX: event.clientX,
                    mouseY: event.clientY,
                    basePath,
                    targetPath: row.path,
                    targetIsDirectory: row.isDirectory,
                    startCreateFile: () => startCreate(row.isDirectory ? row.path : basePath, false),
                    startCreateFolder: () => startCreate(row.isDirectory ? row.path : basePath, true),
                    startRename: onRenameEntry
                      ? () => startRename(row.path, row.isDirectory ? row.path : basePath)
                      : undefined,
                  });
                }}
                onEditingNameChange={setEditingName}
                onRenameKeyDown={handleRenameInputKeyDown}
                onRenameBlur={handleRenameInputBlur}
                onDragOver={handleExternalDragOver}
                onDragEnter={handleRowDragEnter}
                onDragLeave={handleRowDragLeave}
                onDrop={(event, targetPath, targetIsDirectory) => {
                  void handleExternalDrop(event, targetPath, targetIsDirectory);
                }}
              />
            </div>
          );
        })}
      </div>
    </Box>
  );
}
