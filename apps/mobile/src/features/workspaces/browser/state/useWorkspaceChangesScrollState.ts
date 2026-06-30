import { useCallback, useEffect, useRef } from "react";
import type { SectionList } from "react-native";

import type { WorkspaceGitChange, WorkspaceGitChanges } from "@/features/workspaces/workspaces.types";

type ChangeSection = {
  id: keyof WorkspaceGitChanges;
  title: string;
  data: WorkspaceGitChange[];
};

type FocusedLocation = {
  itemIndex: number;
  sectionIndex: number;
} | null;

const changesScrollOffsetCache = new Map<string, number>();

export function useWorkspaceChangesScrollState({
  browserStateId,
  focusedLocation,
}: {
  browserStateId: string;
  focusedLocation: FocusedLocation;
}) {
  const listRef = useRef<SectionList<WorkspaceGitChange, ChangeSection>>(null);
  const hasAppliedInitialScroll = useRef(false);
  const latestScrollOffset = useRef<number>(browserStateId ? (changesScrollOffsetCache.get(browserStateId) ?? 0) : 0);

  useEffect(() => {
    hasAppliedInitialScroll.current = false;
    latestScrollOffset.current = browserStateId ? (changesScrollOffsetCache.get(browserStateId) ?? 0) : 0;
  }, [browserStateId]);

  const handleContentSizeChange = useCallback(() => {
    if (hasAppliedInitialScroll.current) {
      return;
    }

    hasAppliedInitialScroll.current = true;
    requestAnimationFrame(() => {
      if (focusedLocation) {
        listRef.current?.scrollToLocation({
          animated: false,
          itemIndex: focusedLocation.itemIndex,
          sectionIndex: focusedLocation.sectionIndex,
          viewPosition: 0.4,
        });
        return;
      }

      if (latestScrollOffset.current <= 0) {
        return;
      }

      listRef.current?.getScrollResponder()?.scrollTo?.({ animated: false, y: latestScrollOffset.current });
    });
  }, [focusedLocation]);

  const handleScroll = useCallback(
    (nextOffset: number) => {
      latestScrollOffset.current = nextOffset;
      if (!browserStateId) {
        return;
      }

      changesScrollOffsetCache.set(browserStateId, nextOffset);
    },
    [browserStateId],
  );

  const persistScrollOffset = useCallback(() => {
    if (!browserStateId) {
      return;
    }
    changesScrollOffsetCache.set(browserStateId, latestScrollOffset.current);
  }, [browserStateId]);

  return {
    handleContentSizeChange,
    handleScroll,
    listRef,
    persistScrollOffset,
  };
}

export function clearCachedWorkspaceChangesScrollOffset(browserStateId: string) {
  if (!browserStateId) {
    return;
  }

  changesScrollOffsetCache.delete(browserStateId);
}
