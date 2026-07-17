import type { Virtualizer } from "@tanstack/react-virtual";
import { useCallback, useState } from "react";
import { FlatTreeRow } from "./FlatTreeRow";
import type { FileTreeProps, VisibleRow } from "./types";

type FileTreeRowsProps = {
  visibleRows: VisibleRow[];
  virtualizer: Pick<Virtualizer<HTMLDivElement, Element>, "getTotalSize" | "getVirtualItems" | "measureElement">;
  expandedPathSet: Set<string>;
  selectedEntryPath: string;
  ignoredPathSet: Set<string>;
  gitChangesByPath: NonNullable<FileTreeProps["gitChangesByPath"]>;
  ancestorOfGitChangePaths: Set<string>;
  editingEntry: { path: string } | null;
  editingName: string;
  editingInputRef: React.RefObject<HTMLInputElement | null>;
  worktreePath?: string;
  dropTargetPath: string | null;
  setSelectedEntryPath: (path: string) => void;
  setExpandedItems: (updater: (items: string[]) => string[]) => void;
  onSelectEntry?: FileTreeProps["onSelectEntry"];
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
  selectedEntryPath,
  ignoredPathSet,
  gitChangesByPath,
  ancestorOfGitChangePaths,
  editingEntry,
  editingName,
  editingInputRef,
  worktreePath,
  dropTargetPath,
  setSelectedEntryPath,
  setExpandedItems,
  onSelectEntry,
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
        const isSelected = selectedEntryPath === row.path;
        const isIgnored = ignoredPathSet.has(row.path);
        const gitChangeKind = gitChangesByPath[row.path];
        const isEditing = editingEntry?.path === row.path;
        const hasDescendantGitChange = row.isDirectory && ancestorOfGitChangePaths.has(row.path);
        const basePath = row.isDirectory ? row.path : row.path.split("/").slice(0, -1).join("/");

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
                setSelectedEntryPath(row.path);
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
