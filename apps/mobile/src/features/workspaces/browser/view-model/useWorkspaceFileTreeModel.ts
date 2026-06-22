import {
  type WorkspaceFileTreeRow,
  useWorkspaceFileTree,
} from "@/features/workspaces/browser/state/useWorkspaceFileTree";
import type { WorkspaceFileEntry } from "@/features/workspaces/workspaces.types";
import { useWorkspaceFileTreeScrollState } from "../state/useWorkspaceFileTreeScrollState";

type UseWorkspaceFileTreeModelOptions = {
  activeDirectoryPath: string;
  browserStateId: string;
  focusedPath?: string;
  onOpenFile: (path: string) => void;
  organizationId: string;
  projectId: string;
  workspaceId: string;
};

export type WorkspaceFileTreeModel = {
  activeDirectoryPath: string;
  empty: boolean;
  error: boolean;
  focusedPath?: string;
  loading: boolean;
  menuEntry: WorkspaceFileEntry | null;
  onCloseMenu: () => void;
  onCopyMenuEntryPath: () => void;
  onOpenFile: (path: string) => void;
  onOpenMenu: (entry: WorkspaceFileEntry) => void;
  onScrollEnd: () => void;
  onScrollOffsetChange: (offsetY: number) => void;
  onToggleDirectory: (path: string) => void;
  refetch: () => Promise<unknown>;
  rows: WorkspaceFileTreeRow[];
  scrollListRef: ReturnType<typeof useWorkspaceFileTreeScrollState>["listRef"];
  setListContentSize: () => void;
};

export function useWorkspaceFileTreeModel({
  activeDirectoryPath,
  browserStateId,
  focusedPath,
  onOpenFile,
  organizationId,
  projectId,
  workspaceId,
}: UseWorkspaceFileTreeModelOptions): WorkspaceFileTreeModel {
  const tree = useWorkspaceFileTree({
    activeDirectoryPath,
    browserStateId,
    organizationId,
    projectId,
    workspaceId,
  });
  const focusedIndex = focusedPath ? tree.rows.findIndex((row) => row.entry.path === focusedPath) : -1;
  const { handleContentSizeChange, handleScroll, listRef, persistScrollOffset } = useWorkspaceFileTreeScrollState({
    browserStateId,
    focusedIndex,
  });

  return {
    activeDirectoryPath,
    empty: tree.rows.length === 0,
    error: tree.rootQuery.isError,
    focusedPath,
    loading: tree.rootQuery.isLoading,
    menuEntry: tree.menuEntry,
    onCloseMenu: tree.closeMenu,
    onCopyMenuEntryPath: tree.copyMenuEntryPath,
    onOpenFile,
    onOpenMenu: tree.openMenu,
    onScrollEnd: persistScrollOffset,
    onScrollOffsetChange: handleScroll,
    onToggleDirectory: tree.toggleDirectory,
    refetch: tree.rootQuery.refetch,
    rows: tree.rows,
    scrollListRef: listRef,
    setListContentSize: handleContentSizeChange,
  };
}
