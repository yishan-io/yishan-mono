import type { Virtualizer } from "@tanstack/react-virtual";
import { useCallback, useState } from "react";
import { FlatTreeRow } from "./FlatTreeRow";
import type { FileTreeProps, VisibleRow } from "./types";

type FileTreeRowsProps = {
  visibleRows: VisibleRow[];
  virtualizer: Pick<Virtualizer<HTMLDivElement, Element>, "getTotalSize" | "getVirtualItems" | "measureElement">;
  expandedPathSet: Set<string>;
  selectedPaths: Set<string>;
  focusedPath: string;
  ignoredPathSet: Set<string>;
  gitChangesByPath: NonNullable<FileTreeProps["gitChangesByPath"]>;
  ancestorOfGitChangePaths: Set<string>;
  editingEntry: { path: string } | null;
  editingName: string;
  editingInputRef: React.RefObject<HTMLInputElement | null>;
  worktreePath?: string;
  dropTargetPath: string | null;
  setExpandedItems: (updater: (items: string[]) => string[]) => void;
  handleRowClick: (path: string, row: VisibleRow, modifiers: { meta: boolean }) => void;
  handleRowDragStart: (event: React.DragEvent<HTMLElement>, row: VisibleRow, absolutePath: string) => void;
  onOpenEntry?: FileTreeProps["onOpenEntry"];
  onEnsurePathLoaded?: FileTreeProps["onEnsurePathLoaded"];
  onItemContextMenu?: FileTreeProps["onItemContextMenu"];
  onRenameEntry?: FileTreeProps["onRenameEntry"];
  startCreate: (basePath: string, isDirectory: boolean) => void;
  startRename: (targetPath: string, basePath: string) => void;
  setEditingName: (name: string) => void;
  handleRenameInputKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  handleRenameInputBlur: () => void;
  handleExternalDragOver: (event: React.DragEvent<HTMLElement>) => void;
  handleRowDragEnter: (event: React.DragEvent<HTMLElement>, targetPath: string, targetIsDirectory: boolean) => void;
  handleRowDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  handleExternalDrop: (
    event: React.DragEvent<HTMLElement>,
    targetPath: string,
    targetIsDirectory: boolean,
  ) => Promise<void>;
};

/** Renders the virtualized row list for the file tree. */
export function FileTreeRows({
  visibleRows,
  virtualizer,
  expandedPathSet,
  selectedPaths,
  focusedPath,
  ignoredPathSet,
  gitChangesByPath,
  ancestorOfGitChangePaths,
  editingEntry,
  editingName,
  editingInputRef,
  worktreePath,
  dropTargetPath,
  setExpandedItems,
  handleRowClick,
  handleRowDragStart,
  onOpenEntry,
  onEnsurePathLoaded,
  onItemContextMenu,
  onRenameEntry,
  startCreate,
  startRename,
  setEditingName,
  handleRenameInputKeyDown,
  handleRenameInputBlur,
  handleExternalDragOver,
  handleRowDragEnter,
  handleRowDragLeave,
  handleExternalDrop,
}: FileTreeRowsProps) {
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

  const ensurePathLoaded = useCallback(
    (path: string) => {
      if (!onEnsurePathLoaded) {
        return;
      }

      const result = onEnsurePathLoaded(path);
      if (!(result instanceof Promise)) {
        return;
      }

      setLoadingPaths((prev) => new Set([...prev, path]));
      result.finally(() => {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      });
    },
    [onEnsurePathLoaded],
  );

  return (
    <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const row = visibleRows[virtualItem.index];
        if (!row) {
          return null;
        }

        const isExpanded = expandedPathSet.has(row.path);
        const isSelected = focusedPath === row.path;
        const isMultiSelected = selectedPaths.has(row.path);
        const isIgnored = ignoredPathSet.has(row.path);
        const gitChangeKind = gitChangesByPath[row.path];
        const isEditing = editingEntry?.path === row.path;
        const hasDescendantGitChange = row.isDirectory && ancestorOfGitChangePaths.has(row.path);
        const basePath = row.isDirectory ? row.path : row.path.split("/").slice(0, -1).join("/");
        const absolutePath = worktreePath ? `${worktreePath}/${row.path}` : row.path;

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
              isMultiSelected={isMultiSelected}
              isEditing={isEditing}
              editingName={editingName}
              editingInputRef={editingInputRef}
              gitChangeKind={gitChangeKind}
              hasDescendantGitChange={hasDescendantGitChange}
              isIgnored={isIgnored}
              isExpanded={isExpanded}
              isLoading={loadingPaths.has(row.path)}
              isDraggable={Boolean(worktreePath)}
              isDropTarget={dropTargetPath != null && row.isDirectory && row.path === dropTargetPath}
              onSelect={(modifiers) => handleRowClick(row.path, row, modifiers)}
              onDragStart={(event) => handleRowDragStart(event, row, absolutePath)}
              onToggle={() => {
                if (row.isDirectory && !isExpanded) {
                  ensurePathLoaded(row.path);
                }
                setExpandedItems((items) =>
                  items.includes(row.path) ? items.filter((item) => item !== row.path) : [...items, row.path],
                );
              }}
              onOpen={() => {
                if (row.isDirectory) {
                  ensurePathLoaded(row.path);
                  setExpandedItems((items) => [...new Set([...items, row.path])]);
                  return;
                }

                onOpenEntry?.({ path: row.path, isDirectory: false });
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();

                if (selectedPaths.size > 1 && selectedPaths.has(row.path)) {
                  // Multi-select context menu — keep existing selection unchanged
                  onItemContextMenu?.({
                    mouseX: event.clientX,
                    mouseY: event.clientY,
                    basePath,
                    targetPath: row.path,
                    targetIsDirectory: row.isDirectory,
                    selectedPaths: [...selectedPaths],
                    startCreateFile: () => startCreate(basePath, false),
                    startCreateFolder: () => startCreate(basePath, true),
                  });
                } else {
                  // Single-item context menu — update focused path first
                  handleRowClick(row.path, row, { meta: false });
                  onItemContextMenu?.({
                    mouseX: event.clientX,
                    mouseY: event.clientY,
                    basePath,
                    targetPath: row.path,
                    targetIsDirectory: row.isDirectory,
                    startCreateFile: () => startCreate(basePath, false),
                    startCreateFolder: () => startCreate(basePath, true),
                    startRename: onRenameEntry ? () => startRename(row.path, basePath) : undefined,
                  });
                }
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
  );
}
