import { useCallback, useEffect, useRef } from "react";
import type { FlatList } from "react-native";

import type { WorkspaceFileTreeRow } from "@/features/workspaces/browser/state/useWorkspaceFileTree";
const fileTreeScrollOffsetCache = new Map<string, number>();

export function useWorkspaceFileTreeScrollState({
  browserStateId,
  focusedIndex,
}: {
  browserStateId: string;
  focusedIndex: number;
}) {
  const listRef = useRef<FlatList<WorkspaceFileTreeRow>>(null);
  const hasAppliedInitialScroll = useRef(false);
  const latestScrollOffset = useRef<number>(browserStateId ? (fileTreeScrollOffsetCache.get(browserStateId) ?? 0) : 0);

  useEffect(() => {
    hasAppliedInitialScroll.current = false;
    latestScrollOffset.current = browserStateId ? (fileTreeScrollOffsetCache.get(browserStateId) ?? 0) : 0;
  }, [browserStateId]);

  const handleContentSizeChange = useCallback(() => {
    if (hasAppliedInitialScroll.current) {
      return;
    }

    hasAppliedInitialScroll.current = true;
    requestAnimationFrame(() => {
      if (focusedIndex >= 0) {
        listRef.current?.scrollToIndex({ animated: false, index: focusedIndex, viewPosition: 0.4 });
        return;
      }

      if (latestScrollOffset.current > 0) {
        listRef.current?.scrollToOffset({ animated: false, offset: latestScrollOffset.current });
      }
    });
  }, [focusedIndex]);

  const handleScroll = useCallback(
    (nextOffset: number) => {
      latestScrollOffset.current = nextOffset;
      if (!browserStateId) {
        return;
      }

      fileTreeScrollOffsetCache.set(browserStateId, nextOffset);
    },
    [browserStateId],
  );

  const persistScrollOffset = useCallback(() => {
    if (!browserStateId) {
      return;
    }
    fileTreeScrollOffsetCache.set(browserStateId, latestScrollOffset.current);
  }, [browserStateId]);

  return {
    handleContentSizeChange,
    handleScroll,
    listRef,
    persistScrollOffset,
  };
}

export function clearCachedWorkspaceFileTreeScrollOffset(browserStateId: string) {
  if (!browserStateId) {
    return;
  }

  fileTreeScrollOffsetCache.delete(browserStateId);
}
