import type { WorkbenchTab } from "../../../../features/workbench/model/types";
import type { TabStoreStateSlice } from "./types";

function remapPathByRename(path: string, fromPath: string, toPath: string): string | null {
  if (path === fromPath) {
    return toPath;
  }
  const prefix = `${fromPath}/`;
  if (!path.startsWith(prefix)) {
    return null;
  }
  return `${toPath}/${path.slice(prefix.length)}`;
}

function clearTemporaryOnPin(tab: WorkbenchTab): WorkbenchTab {
  if (tab.kind === "file" && tab.data.isTemporary) {
    return { ...tab, pinned: true, data: { ...tab.data, isTemporary: false } };
  }
  if (tab.kind === "image" && tab.data.isTemporary) {
    return { ...tab, pinned: true, data: { ...tab.data, isTemporary: false } };
  }
  if (tab.kind === "video" && tab.data.isTemporary) {
    return { ...tab, pinned: true, data: { ...tab.data, isTemporary: false } };
  }
  if (tab.kind === "audio" && tab.data.isTemporary) {
    return { ...tab, pinned: true, data: { ...tab.data, isTemporary: false } };
  }
  if (tab.kind === "diff" && tab.data.isTemporary) {
    return { ...tab, pinned: true, data: { ...tab.data, isTemporary: false } };
  }
  return { ...tab, pinned: !tab.pinned };
}

/** Promotes one temporary tab to permanent (non-temporary) state. No-op if not temporary. */
export function promoteTemporaryTabState(state: TabStoreStateSlice, tabId: string): Partial<TabStoreStateSlice> | null {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return null;
  if (
    (tab.kind === "file" ||
      tab.kind === "image" ||
      tab.kind === "video" ||
      tab.kind === "audio" ||
      tab.kind === "diff") &&
    tab.data.isTemporary
  ) {
    return {
      tabs: state.tabs.map((t): WorkbenchTab => {
        if (t.id !== tabId) return t;
        if (t.kind === "file") return { ...t, data: { ...t.data, isTemporary: false } };
        if (t.kind === "image") return { ...t, data: { ...t.data, isTemporary: false } };
        if (t.kind === "video") return { ...t, data: { ...t.data, isTemporary: false } };
        if (t.kind === "audio") return { ...t, data: { ...t.data, isTemporary: false } };
        if (t.kind === "diff") return { ...t, data: { ...t.data, isTemporary: false } };
        return t;
      }),
    };
  }
  return null;
}

/** Toggles pinned state for one tab id. */
export function toggleTabPinnedState(state: TabStoreStateSlice, tabId: string): Partial<TabStoreStateSlice> {
  return {
    tabs: state.tabs.map((tab) => (tab.id === tabId ? clearTemporaryOnPin(tab) : tab)),
  };
}

/** Renames one tab id while preserving all other tab fields. */
export function renameTabState(
  state: TabStoreStateSlice,
  tabId: string,
  title: string,
  options?: { userRenamed?: boolean },
): Partial<TabStoreStateSlice> | null {
  const targetTab = state.tabs.find((tab) => tab.id === tabId);
  if (!targetTab || targetTab.title === title) {
    return null;
  }

  // A programmatic title update (e.g. terminal output title) must not overwrite
  // a name the user explicitly set.
  if (
    !options?.userRenamed &&
    (targetTab.kind === "terminal" || targetTab.kind === "agent-chat") &&
    targetTab.data.userRenamed
  ) {
    return null;
  }

  return {
    tabs: state.tabs.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }
      if (options?.userRenamed && tab.kind === "terminal") {
        return { ...tab, title, data: { ...tab.data, userRenamed: true } };
      }
      if (options?.userRenamed && tab.kind === "agent-chat") {
        return { ...tab, title, data: { ...tab.data, userRenamed: true } };
      }
      return { ...tab, title };
    }),
  };
}

/** Applies one file-tree rename to open file and diff tabs in one workspace. */
export function renameTabsForEntryRenameState(
  state: TabStoreStateSlice,
  workspaceId: string,
  fromPath: string,
  toPath: string,
): Partial<TabStoreStateSlice> | null {
  if (!workspaceId || !fromPath || !toPath || fromPath === toPath) {
    return null;
  }

  let didChange = false;
  const tabs = state.tabs.map((tab) => {
    if (tab.workspaceId !== workspaceId) {
      return tab;
    }
    if (
      tab.kind !== "file" &&
      tab.kind !== "diff" &&
      tab.kind !== "image" &&
      tab.kind !== "video" &&
      tab.kind !== "audio"
    ) {
      return tab;
    }

    const remappedPath = remapPathByRename(tab.data.path, fromPath, toPath);
    if (!remappedPath || remappedPath === tab.data.path) {
      return tab;
    }

    const nextTitle = remappedPath.split("/").filter(Boolean).at(-1) ?? remappedPath;
    didChange = true;
    if (tab.kind === "file") {
      return {
        ...tab,
        title: nextTitle,
        data: {
          ...tab.data,
          path: remappedPath,
        },
      };
    }

    if (tab.kind === "image") {
      return {
        ...tab,
        title: nextTitle,
        data: {
          ...tab.data,
          path: remappedPath,
        },
      };
    }

    if (tab.kind === "video") {
      return {
        ...tab,
        title: nextTitle,
        data: {
          ...tab.data,
          path: remappedPath,
        },
      };
    }

    if (tab.kind === "audio") {
      return {
        ...tab,
        title: nextTitle,
        data: {
          ...tab.data,
          path: remappedPath,
        },
      };
    }

    return {
      ...tab,
      title: nextTitle,
      data: {
        ...tab.data,
        path: remappedPath,
      },
    };
  });

  if (!didChange) {
    return null;
  }

  return { tabs };
}

/** Updates editable content for one file tab and recomputes dirty state. */
export function updateFileTabContentState(
  state: TabStoreStateSlice,
  tabId: string,
  content: string,
): Partial<TabStoreStateSlice> {
  return {
    tabs: state.tabs.map((tab) => {
      if (tab.id !== tabId || tab.kind !== "file") {
        return tab;
      }
      const isDirty = content !== tab.data.savedContent;
      return {
        ...tab,
        data: {
          ...tab.data,
          content,
          isDirty,
          // Editing a temporary (preview) tab promotes it to a normal tab.
          // Re-emissions of the saved content (e.g. disk sync) keep it temporary.
          isTemporary: isDirty ? false : tab.data.isTemporary,
          isDeleted: false,
        },
      };
    }),
  };
}

/** Marks one file tab as saved by syncing savedContent and dirty state. */
export function markFileTabSavedState(state: TabStoreStateSlice, tabId: string): Partial<TabStoreStateSlice> {
  return {
    tabs: state.tabs.map((tab) =>
      tab.id === tabId && tab.kind === "file"
        ? {
            ...tab,
            data: {
              ...tab.data,
              savedContent: tab.data.content,
              isDirty: false,
              isDeleted: false,
            },
          }
        : tab,
    ),
  };
}

/** Syncs one open file tab with disk state after external changes. */
export function refreshFileTabFromDiskState(
  state: TabStoreStateSlice,
  input: {
    tabId: string;
    content: string;
    deleted: boolean;
  },
): Partial<TabStoreStateSlice> | null {
  const targetTab = state.tabs.find((tab) => tab.id === input.tabId);
  if (!targetTab || targetTab.kind !== "file") {
    return null;
  }

  if (targetTab.data.isDirty) {
    return null;
  }

  const nextContent = input.deleted ? "" : input.content;
  if (
    targetTab.data.content === nextContent &&
    targetTab.data.savedContent === nextContent &&
    !!targetTab.data.isDeleted === input.deleted
  ) {
    return null;
  }

  return {
    tabs: state.tabs.map((tab) =>
      tab.id === input.tabId && tab.kind === "file"
        ? {
            ...tab,
            data: {
              ...tab.data,
              content: nextContent,
              savedContent: nextContent,
              isDirty: false,
              isDeleted: input.deleted,
            },
          }
        : tab,
    ),
  };
}

/** Syncs one open diff tab content after external changes. */
export function refreshDiffTabContentState(
  state: TabStoreStateSlice,
  input: {
    tabId: string;
    oldContent: string;
    newContent: string;
  },
): Partial<TabStoreStateSlice> | null {
  const targetTab = state.tabs.find((tab) => tab.id === input.tabId);
  if (!targetTab || targetTab.kind !== "diff") {
    return null;
  }

  if (targetTab.data.oldContent === input.oldContent && targetTab.data.newContent === input.newContent) {
    return null;
  }

  return {
    tabs: state.tabs.map((tab) =>
      tab.id === input.tabId && tab.kind === "diff"
        ? {
            ...tab,
            data: {
              ...tab.data,
              oldContent: input.oldContent,
              newContent: input.newContent,
            },
          }
        : tab,
    ),
  };
}

/** Reorders tabs inside one workspace and pin-group while preserving global list shape. */
export function reorderTabState(
  state: TabStoreStateSlice,
  draggedTabId: string,
  targetTabId: string,
  position: "before" | "after",
): Partial<TabStoreStateSlice> | null {
  if (draggedTabId === targetTabId) {
    return null;
  }

  const draggedTab = state.tabs.find((tab) => tab.id === draggedTabId);
  const targetTab = state.tabs.find((tab) => tab.id === targetTabId);
  if (!draggedTab || !targetTab) {
    return null;
  }

  if (draggedTab.workspaceId !== targetTab.workspaceId || draggedTab.pinned !== targetTab.pinned) {
    return null;
  }

  const scopedTabs = state.tabs.filter(
    (tab) => tab.workspaceId === draggedTab.workspaceId && tab.pinned === draggedTab.pinned,
  );
  const tabsWithoutDragged = scopedTabs.filter((tab) => tab.id !== draggedTabId);
  const targetIndex = tabsWithoutDragged.findIndex((tab) => tab.id === targetTabId);
  if (targetIndex < 0) {
    return null;
  }

  const insertAt = position === "before" ? targetIndex : targetIndex + 1;
  const reorderedScopedTabs = [...tabsWithoutDragged];
  reorderedScopedTabs.splice(insertAt, 0, draggedTab);

  let scopedTabCursor = 0;
  return {
    tabs: state.tabs.map((tab) => {
      const inScope = tab.workspaceId === draggedTab.workspaceId && tab.pinned === draggedTab.pinned;
      if (!inScope) {
        return tab;
      }

      const nextTab = reorderedScopedTabs[scopedTabCursor];
      scopedTabCursor += 1;
      return nextTab ?? tab;
    }),
    selectedTabId: draggedTabId,
    selectedTabIdByWorkspaceId: {
      ...state.selectedTabIdByWorkspaceId,
      [draggedTab.workspaceId]: draggedTabId,
    },
  };
}
