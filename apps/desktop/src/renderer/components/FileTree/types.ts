export type FileTreeContextMenuRequest = {
  mouseX: number;
  mouseY: number;
  basePath: string;
  targetPath: string;
  targetIsDirectory: boolean;
  startCreateFile: () => void;
  startCreateFolder: () => void;
  startRename?: () => void;
  selectedPaths?: string[];
};

export type FileTreeGitChangeKind = "added" | "modified" | "deleted" | "renamed";

export type FileTreeProps = {
  files: string[];
  gitChangesByPath?: Record<string, FileTreeGitChangeKind>;
  ignoredPaths?: string[];
  expandedItems?: string[];
  /** Absolute path to the workspace root. When provided, rows become draggable
   *  and the drag payload contains absolute paths (worktreePath + relative path). */
  worktreePath?: string;
  selectionRequest?: { path: string; requestId: number; focus?: boolean } | null;
  createEntryRequest?: { kind: "file" | "folder"; basePath?: string; requestId: number } | null;
  onSelectEntry?: (input: { path: string; isDirectory: boolean; isMultiSelectOperation?: boolean }) => void;
  onSelectionChange?: (paths: string[]) => void;
  onOpenEntry?: (input: { path: string; isDirectory: boolean }) => void;
  onExpandedItemsChange?: (items: string[]) => void;
  onEnsurePathLoaded?: (path: string) => void | Promise<void>;
  onCreateEntry?: (input: { path: string; isDirectory: boolean }) => void | Promise<void>;
  onRenameEntry?: (path: string, nextName: string) => void | Promise<void>;
  onDeleteEntry?: (path: string) => void | Promise<void>;
  onCopyEntry?: (path: string) => void | Promise<void>;
  onCutEntry?: (path: string) => void | Promise<void>;
  onPasteEntries?: (destinationPath: string) => void | Promise<void>;
  canPasteEntries?: boolean;
  onUndoLastEntryOperation?: () => void | Promise<void>;
  canUndoLastEntryOperation?: boolean;
  onDropExternalEntries?: (sourcePaths: string[], destinationPath: string) => void | Promise<void>;
  /** Called when entries are drag-and-dropped within the tree to move them to a new directory. */
  onMoveEntries?: (sourceRelativePaths: string[], destinationPath: string) => void | Promise<void>;
  onItemContextMenu?: (request: FileTreeContextMenuRequest) => void;
};

export type TreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, TreeNode>;
};

export type VisibleRow = {
  path: string;
  name: string;
  depth: number;
  isDirectory: boolean;
  hasChildren: boolean;
};

export type EditingEntry = {
  mode: "rename" | "create";
  path: string;
  basePath: string;
  isDirectory: boolean;
};
