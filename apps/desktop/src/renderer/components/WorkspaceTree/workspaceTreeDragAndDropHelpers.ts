import { WORKSPACE_TREE_ROW_HEIGHT } from "./WorkspaceTreeRow";
import type { WorkspaceTreeRow } from "./types";

export type WorkspaceTreeDropPosition = "before" | "after";
export type WorkspaceTreeDraggedRowKind = WorkspaceTreeRow["kind"] | null;

/** Find the nearest valid drop target for the hovered row. */
export function findValidDropTarget({
  hoveredRow,
  draggedRowId,
  draggedRowKind,
  draggedParentId,
  rowById,
}: {
  hoveredRow: WorkspaceTreeRow;
  draggedRowId: string;
  draggedRowKind: WorkspaceTreeDraggedRowKind;
  draggedParentId: string | null;
  rowById: Map<string, WorkspaceTreeRow>;
}): { targetRow: WorkspaceTreeRow; isDescendant: boolean } | null {
  if (!draggedRowId || !draggedRowKind || hoveredRow.id === draggedRowId) {
    return null;
  }

  if (hoveredRow.kind === draggedRowKind && hoveredRow.parentId === draggedParentId) {
    return { targetRow: hoveredRow, isDescendant: false };
  }

  let current: WorkspaceTreeRow = hoveredRow;
  for (let depth = 0; depth < 8; depth += 1) {
    const parentId = current.parentId;
    if (!parentId) {
      break;
    }

    const parent = rowById.get(parentId);
    if (!parent || parent.id === draggedRowId) {
      break;
    }

    if (parent.kind === draggedRowKind && parent.parentId === draggedParentId) {
      return { targetRow: parent, isDescendant: true };
    }

    current = parent;
  }

  return null;
}

/** Resolve the drop indicator offset for the current drag target. */
export function getDropIndicatorTop({
  draggedRowId,
  dropTargetPosition,
  dropTargetRowId,
  visibleRows,
}: {
  draggedRowId: string;
  dropTargetPosition: WorkspaceTreeDropPosition;
  dropTargetRowId: string;
  visibleRows: WorkspaceTreeRow[];
}): number | null {
  if (!draggedRowId || !dropTargetRowId) {
    return null;
  }

  const rowIndex = visibleRows.findIndex((row) => row.id === dropTargetRowId);
  if (rowIndex < 0) {
    return null;
  }

  if (dropTargetPosition === "before") {
    return rowIndex * WORKSPACE_TREE_ROW_HEIGHT;
  }

  const targetRow = visibleRows[rowIndex];
  if (!targetRow) {
    return null;
  }

  const subtreeLastIndex = targetRow.hasChildren ? resolveSubtreeLastIndex(visibleRows, rowIndex) : rowIndex;
  return (subtreeLastIndex + 1) * WORKSPACE_TREE_ROW_HEIGHT;
}

function resolveSubtreeLastIndex(visibleRows: WorkspaceTreeRow[], startIndex: number): number {
  const startRow = visibleRows[startIndex];
  if (!startRow || !startRow.hasChildren) {
    return startIndex;
  }

  let lastIndex = startIndex;
  for (let index = startIndex + 1; index < visibleRows.length; index += 1) {
    const candidate = visibleRows[index];
    if (!candidate || candidate.depth <= startRow.depth) {
      break;
    }

    lastIndex = index;
  }

  return lastIndex;
}
