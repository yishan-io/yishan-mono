import type { DragEvent } from "react";
import { useMemo, useRef, useState } from "react";
import type { WorkspaceTreeProps, WorkspaceTreeRow } from "./types";
import { findValidDropTarget, getDropIndicatorTop } from "./workspaceTreeDragAndDropHelpers";

type UseWorkspaceTreeDragAndDropInput = {
  visibleRows: WorkspaceTreeRow[];
  rowById: Map<string, WorkspaceTreeRow>;
  onRowReorder?: WorkspaceTreeProps["onRowReorder"];
};

type UseWorkspaceTreeDragAndDropOutput = {
  dropIndicatorTop: number | null;
  handleDragStart: (row: WorkspaceTreeRow) => void;
  handleDragOver: (event: DragEvent<HTMLElement>, row: WorkspaceTreeRow) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
  handleDragEnd: () => void;
};

/** Manage row drag-and-drop state for the workspace tree. */
export function useWorkspaceTreeDragAndDrop({
  visibleRows,
  rowById,
  onRowReorder,
}: UseWorkspaceTreeDragAndDropInput): UseWorkspaceTreeDragAndDropOutput {
  const draggedRowIdRef = useRef("");
  const draggedRowKindRef = useRef<WorkspaceTreeRow["kind"] | null>(null);
  const draggedParentIdRef = useRef<string | null>(null);
  const dropTargetRowIdRef = useRef("");
  const [draggedRowId, setDraggedRowId] = useState("");
  const [dropTargetRowId, setDropTargetRowId] = useState("");
  const [dropTargetPosition, setDropTargetPosition] = useState<"before" | "after">("before");

  const resetDragState = () => {
    draggedRowIdRef.current = "";
    draggedRowKindRef.current = null;
    draggedParentIdRef.current = null;
    dropTargetRowIdRef.current = "";
    setDraggedRowId("");
    setDropTargetRowId("");
    setDropTargetPosition("before");
  };

  const dropIndicatorTop = useMemo(
    () =>
      getDropIndicatorTop({
        draggedRowId,
        dropTargetPosition,
        dropTargetRowId,
        visibleRows,
      }),
    [draggedRowId, dropTargetPosition, dropTargetRowId, visibleRows],
  );

  const handleDragStart = (row: WorkspaceTreeRow) => {
    draggedRowIdRef.current = row.id;
    draggedRowKindRef.current = row.kind;
    draggedParentIdRef.current = row.parentId;
    setDraggedRowId(row.id);
    setDropTargetRowId("");
    setDropTargetPosition("before");
  };

  const handleDragOver = (event: DragEvent<HTMLElement>, row: WorkspaceTreeRow) => {
    const found = findValidDropTarget({
      hoveredRow: row,
      draggedRowId: draggedRowIdRef.current,
      draggedRowKind: draggedRowKindRef.current,
      draggedParentId: draggedParentIdRef.current,
      rowById,
    });
    if (!found) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const rect = event.currentTarget.getBoundingClientRect();
    const nextPosition = found.isDescendant
      ? "after"
      : event.clientY >= rect.top + rect.height / 2
        ? "after"
        : "before";

    dropTargetRowIdRef.current = found.targetRow.id;
    setDropTargetRowId(found.targetRow.id);
    setDropTargetPosition(nextPosition);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    const activeDraggedRowId = draggedRowIdRef.current;
    const activeDraggedRowKind = draggedRowKindRef.current;
    const targetRowId = dropTargetRowIdRef.current;
    if (!activeDraggedRowId || !activeDraggedRowKind || !targetRowId || activeDraggedRowId === targetRowId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const targetRow = rowById.get(targetRowId);
    if (!targetRow) {
      return;
    }

    onRowReorder?.({
      draggedRowId: activeDraggedRowId,
      targetRowId,
      rowKind: activeDraggedRowKind,
      parentId: targetRow.parentId,
      position: dropTargetPosition,
    });

    setDropTargetRowId("");
    setDropTargetPosition("before");
  };

  return {
    dropIndicatorTop,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd: resetDragState,
  };
}
