import type { DragEvent } from "react";
import { useState } from "react";

type WorkspaceTab = {
  id: string;
  pinned: boolean;
};

type UseTabDragDropOptions = {
  tabs: WorkspaceTab[];
  canDragTabs: boolean;
  onReorderTab?: (draggedTabId: string, targetTabId: string, position: "before" | "after") => void;
  onTabDragStart?: (tabId: string) => void;
  onTabDragEnd?: () => void;
};

/**
 * Manages tab drag-and-drop reorder state: dragged tab id, drop target, and
 * all drag event handlers for individual tabs and the scrollable container.
 */
export function useTabDragDrop({
  tabs,
  canDragTabs,
  onReorderTab,
  onTabDragStart,
  onTabDragEnd,
}: UseTabDragDropOptions) {
  const [draggedTabId, setDraggedTabId] = useState("");
  const [dropTarget, setDropTarget] = useState<{
    tabId: string;
    position: "before" | "after";
  } | null>(null);

  const resetDragState = () => {
    setDraggedTabId("");
    setDropTarget(null);
    onTabDragEnd?.();
  };

  /**
   * Resolves the target used when dropping near the right edge of the scroll area.
   * The target stays inside the dragged tab's pin-group so pinned and unpinned
   * tabs preserve their group boundaries during drag reordering.
   */
  const resolveTrailingDropTarget = (draggedId: string) => {
    const draggedTab = tabs.find((tab) => tab.id === draggedId);
    if (!draggedTab) {
      return null;
    }

    const lastTabInGroup =
      tabs.filter((tab) => tab.pinned === draggedTab.pinned && tab.id !== draggedId).at(-1) ?? null;

    if (!lastTabInGroup) {
      return null;
    }

    return {
      tabId: lastTabInGroup.id,
      position: "after" as const,
    };
  };

  const handleTabDragStart = (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab, editingTabId: string) => {
    if (!canDragTabs || editingTabId) {
      event.preventDefault();
      return;
    }

    setDraggedTabId(tab.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tab.id);
    event.dataTransfer.setData("application/x-tab-id", tab.id);
    onTabDragStart?.(tab.id);
  };

  const handleTabDragOver = (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => {
    if (!canDragTabs) {
      return;
    }

    const draggedId = draggedTabId || event.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === tab.id) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const position = event.clientX < midpoint ? "before" : "after";
    setDropTarget({ tabId: tab.id, position });
    event.dataTransfer.dropEffect = "move";
  };

  const handleTabDrop = (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => {
    if (!canDragTabs) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const draggedId = draggedTabId || event.dataTransfer.getData("text/plain");
    const position = dropTarget?.tabId === tab.id ? dropTarget.position : "before";

    if (draggedId && draggedId !== tab.id) {
      onReorderTab?.(draggedId, tab.id, position);
    }

    resetDragState();
  };

  const handleTabsContainerDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canDragTabs) {
      return;
    }

    const draggedId = draggedTabId || event.dataTransfer.getData("text/plain");
    if (!draggedId) {
      return;
    }

    const draggedTab = tabs.find((tab) => tab.id === draggedId);
    if (!draggedTab || draggedTab.pinned) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const rightEdgeThreshold = 24;

    if (event.clientX >= rect.right - rightEdgeThreshold) {
      const trailingTarget = resolveTrailingDropTarget(draggedId);
      if (trailingTarget) {
        event.preventDefault();
        setDropTarget(trailingTarget);
        event.dataTransfer.dropEffect = "move";
      }
    }
  };

  const handleTabsContainerDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canDragTabs) {
      return;
    }

    const draggedId = draggedTabId || event.dataTransfer.getData("text/plain");
    if (!draggedId) {
      resetDragState();
      return;
    }

    const draggedTab = tabs.find((tab) => tab.id === draggedId);
    if (!draggedTab || draggedTab.pinned) {
      resetDragState();
      return;
    }

    const trailingTarget = resolveTrailingDropTarget(draggedId);
    const target = dropTarget ?? trailingTarget;

    if (target) {
      event.preventDefault();
      onReorderTab?.(draggedId, target.tabId, target.position);
    }

    resetDragState();
  };

  return {
    draggedTabId,
    dropTarget,
    resetDragState,
    handleTabDragStart,
    handleTabDragOver,
    handleTabDrop,
    handleTabsContainerDragOver,
    handleTabsContainerDrop,
  };
}
