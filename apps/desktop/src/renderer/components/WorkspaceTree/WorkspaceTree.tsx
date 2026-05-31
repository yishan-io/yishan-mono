import { Box } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { WORKSPACE_TREE_ROW_HEIGHT, WorkspaceTreeRowView } from "./WorkspaceTreeRow";
import type { WorkspaceTreeProps, WorkspaceTreeRow } from "./types";
import { useVisibleWorkspaceTree } from "./useVisibleWorkspaceTree";

function parseCompositeNodeRowId(id: string): { projectId: string; nodeId: string } | null {
  const value = id.replace(/^node:/, "");
  const splitIndex = value.indexOf(":");
  if (splitIndex <= 0) {
    return null;
  }

  return {
    projectId: value.slice(0, splitIndex),
    nodeId: value.slice(splitIndex + 1),
  };
}

function parseProjectRowId(id: string): { projectId: string; nodeId?: string } | null {
  const value = id.replace(/^project:/, "");
  const splitIndex = value.indexOf(":");
  if (splitIndex <= 0) {
    return { projectId: value };
  }

  return {
    nodeId: value.slice(0, splitIndex),
    projectId: value.slice(splitIndex + 1),
  };
}

export function WorkspaceTree({
  projects,
  nodes,
  workspaces,
  selectedProjectId,
  selectedNodeId,
  selectedWorkspaceId,
  hierarchyMode = "by_project",
  expandedItems,
  onExpandedItemsChange,
  onSelectProject,
  onSelectNode,
  onSelectWorkspace,
  deleteWorkspaceLabel,
  onProjectContextMenu,
  onWorkspaceContextMenu,
  onWorkspaceMouseEnter,
  onWorkspaceMouseLeave,
  onWorkspaceRequestDelete,
  createWorkspaceTooltipLabel,
  onProjectCreateWorkspaceClick,
  onProjectActionsClick,
  onRowReorder,
}: WorkspaceTreeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const draggedRowIdRef = useRef("");
  const draggedRowKindRef = useRef<"project" | "node" | "workspace" | null>(null);
  const draggedParentIdRef = useRef<string | null>(null);
  const dropTargetRowIdRef = useRef("");
  const dropTargetPositionRef = useRef<"before" | "after">("before");
  const [draggedRowId, setDraggedRowId] = useState("");
  const [dropTargetRowId, setDropTargetRowId] = useState("");
  const [dropTargetPosition, setDropTargetPosition] = useState<"before" | "after">("before");
  const workspaceById = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace])), [workspaces]);

  const { visibleRows, isExpanded, toggleExpanded } = useVisibleWorkspaceTree({
    projects,
    nodes,
    workspaces,
    hierarchyMode,
    expandedItemsOverride: expandedItems,
    onExpandedItemsChange,
  });

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => WORKSPACE_TREE_ROW_HEIGHT,
    overscan: 16,
  });

  const rowById = useMemo(() => new Map(visibleRows.map((row) => [row.id, row])), [visibleRows]);

  /**
   * Given a row the cursor is over, find the nearest valid drop target for
   * the current drag. Returns the resolved row and whether it was found by
   * walking up the parentId chain (i.e. the cursor is over a descendant, which
   * always means "after" position relative to the target).
   */
  const findValidDropTarget = (hoveredRow: WorkspaceTreeRow): { targetRow: WorkspaceTreeRow; isDescendant: boolean } | null => {
    const activeDraggedRowId = draggedRowIdRef.current;
    const activeDraggedRowKind = draggedRowKindRef.current;
    const activeDraggedParentId = draggedParentIdRef.current;
    if (!activeDraggedRowId || !activeDraggedRowKind) {
      return null;
    }

    if (hoveredRow.id === activeDraggedRowId) {
      return null;
    }

    // Direct same-kind same-parent match
    if (hoveredRow.kind === activeDraggedRowKind && hoveredRow.parentId === activeDraggedParentId) {
      return { targetRow: hoveredRow, isDescendant: false };
    }

    // Walk up parentId chain to find an ancestor that matches
    let current: WorkspaceTreeRow = hoveredRow;
    for (let depth = 0; depth < 8; depth += 1) {
      const parentId = current.parentId;
      if (!parentId) {
        break;
      }

      const parent = rowById.get(parentId);
      if (!parent) {
        break;
      }

      if (parent.id === activeDraggedRowId) {
        break; // can't drop on itself
      }

      if (parent.kind === activeDraggedRowKind && parent.parentId === activeDraggedParentId) {
        return { targetRow: parent, isDescendant: true };
      }

      current = parent;
    }

    return null;
  };

  const dropIndicatorTop = useMemo(() => {
    if (!draggedRowId || !dropTargetRowId) {
      return null;
    }

    const rowIndex = visibleRows.findIndex((row) => row.id === dropTargetRowId);
    if (rowIndex < 0) {
      return null;
    }

    const targetRow = visibleRows[rowIndex];
    if (!targetRow) {
      return null;
    }

    const resolveSubtreeLastIndex = (startIndex: number): number => {
      const startRow = visibleRows[startIndex];
      if (!startRow || !startRow.hasChildren) {
        return startIndex;
      }

      let lastIndex = startIndex;
      for (let index = startIndex + 1; index < visibleRows.length; index += 1) {
        const candidate = visibleRows[index];
        if (!candidate) {
          break;
        }

        if (candidate.depth <= startRow.depth) {
          break;
        }

        lastIndex = index;
      }

      return lastIndex;
    };

    if (dropTargetPosition === "before") {
      return rowIndex * WORKSPACE_TREE_ROW_HEIGHT;
    }

    const subtreeLastIndex = targetRow.hasChildren ? resolveSubtreeLastIndex(rowIndex) : rowIndex;
    return (subtreeLastIndex + 1) * WORKSPACE_TREE_ROW_HEIGHT;
  }, [draggedRowId, dropTargetPosition, dropTargetRowId, visibleRows]);

  return (
    <Box ref={scrollRef} role="tree" sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1 }}>
      <Box sx={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {(virtualizer.getVirtualItems().length > 0
          ? virtualizer.getVirtualItems()
          : visibleRows.map((_, index) => ({ index, key: index, start: index * WORKSPACE_TREE_ROW_HEIGHT }))
        ).map((item) => {
          const row = visibleRows[item.index];
          if (!row) {
            return null;
          }

          const expanded = row.hasChildren && isExpanded(row.id);
          const parsedProject = row.kind === "project" ? parseProjectRowId(row.id) : null;
          const isSelected =
            (row.kind === "project" && !selectedWorkspaceId && parsedProject?.projectId === (selectedProjectId ?? "")) ||
            (row.kind === "node" &&
              (hierarchyMode === "by_project"
                ? row.id === `node:${selectedProjectId ?? ""}:${selectedNodeId ?? ""}`
                : row.id === `node:${selectedNodeId ?? ""}`)) ||
            (row.kind === "workspace" && row.id === `workspace:${selectedWorkspaceId ?? ""}`);

          return (
            <Box
              key={item.key}
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start}px)`,
              }}
            >
              <WorkspaceTreeRowView
                row={row}
                draggable
                isExpanded={expanded}
                isSelected={isSelected}
                onDragStart={(event) => {
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = "move";
                  draggedRowIdRef.current = row.id;
                  draggedRowKindRef.current = row.kind;
                  draggedParentIdRef.current = row.parentId;
                  setDraggedRowId(row.id);
                  setDropTargetRowId("");
                  setDropTargetPosition("before");
                }}
                 onDragOver={(event) => {
                    const found = findValidDropTarget(row);
                    if (!found) {
                      return;
                    }

                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";

                    let nextPosition: "before" | "after";
                    if (found.isDescendant) {
                      // Cursor is inside the target's subtree → always "after"
                      nextPosition = "after";
                    } else {
                      const { top, height } = event.currentTarget.getBoundingClientRect();
                      nextPosition = event.clientY >= top + height / 2 ? "after" : "before";
                    }

                    dropTargetRowIdRef.current = found.targetRow.id;
                    dropTargetPositionRef.current = nextPosition;
                    setDropTargetRowId(found.targetRow.id);
                    setDropTargetPosition(nextPosition);
                  }}
                 onDrop={(event) => {
                    const activeDraggedRowId = draggedRowIdRef.current;
                    const activeDraggedRowKind = draggedRowKindRef.current;
                    const resolvedTargetRowId = dropTargetRowIdRef.current;
                    const resolvedPosition = dropTargetPositionRef.current;
                    if (!activeDraggedRowId || !activeDraggedRowKind || !resolvedTargetRowId) {
                      return;
                    }

                    if (activeDraggedRowId === resolvedTargetRowId) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();

                    const targetRow = rowById.get(resolvedTargetRowId);
                    if (!targetRow) {
                      return;
                    }

                    onRowReorder?.({
                      draggedRowId: activeDraggedRowId,
                      targetRowId: resolvedTargetRowId,
                      rowKind: activeDraggedRowKind,
                      parentId: targetRow.parentId,
                      position: resolvedPosition,
                    });

                    dropTargetRowIdRef.current = "";
                    dropTargetPositionRef.current = "before";
                    setDropTargetRowId("");
                    setDropTargetPosition("before");
                  }}
                 onDragEnd={() => {
                    draggedRowIdRef.current = "";
                    draggedRowKindRef.current = null;
                    draggedParentIdRef.current = null;
                    dropTargetRowIdRef.current = "";
                    dropTargetPositionRef.current = "before";
                    setDraggedRowId("");
                    setDropTargetRowId("");
                    setDropTargetPosition("before");
                  }}
                onToggle={() => {
                  if (!row.hasChildren) {
                    return;
                  }

                  toggleExpanded(row.id);
                }}
                deleteWorkspaceLabel={deleteWorkspaceLabel}
                createWorkspaceTooltipLabel={createWorkspaceTooltipLabel}
                onWorkspaceRequestDelete={() => {
                  if (row.kind !== "workspace") {
                    return;
                  }

                  const workspaceId = row.id.replace(/^workspace:/, "");
                  const workspace = workspaceById.get(workspaceId);
                  if (!workspace) {
                    return;
                  }

                  onWorkspaceRequestDelete?.(workspaceId, workspace.projectId);
                }}
                onMouseEnter={(event) => {
                  if (row.kind !== "workspace") {
                    return;
                  }

                  const workspaceId = row.id.replace(/^workspace:/, "");
                  onWorkspaceMouseEnter?.(event, workspaceId);
                }}
                onMouseLeave={() => {
                  if (row.kind !== "workspace") {
                    return;
                  }

                  onWorkspaceMouseLeave?.();
                }}
                onContextMenu={(event) => {
                  if (row.kind === "project") {
                    const projectId = parseProjectRowId(row.id)?.projectId ?? "";
                    onProjectContextMenu?.(event, projectId);
                    return;
                  }

                  if (row.kind === "workspace") {
                    const workspaceId = row.id.replace(/^workspace:/, "");
                    const workspace = workspaceById.get(workspaceId);
                    if (!workspace) {
                      return;
                    }

                    onWorkspaceContextMenu?.(event, workspaceId, workspace.projectId);
                  }
                }}
                onProjectActionsClick={(event) => {
                  if (row.kind !== "project") {
                    return;
                  }

                  const projectId = parseProjectRowId(row.id)?.projectId ?? "";
                  onProjectActionsClick?.(event, projectId);
                }}
                onProjectCreateWorkspaceClick={(event) => {
                  if (row.kind !== "project") {
                    return;
                  }

                  const projectId = parseProjectRowId(row.id)?.projectId ?? "";
                  onProjectCreateWorkspaceClick?.(event, projectId);
                }}
                onClick={() => {
                  if (row.kind === "project") {
                    const projectId = parseProjectRowId(row.id)?.projectId ?? "";
                    onSelectProject?.(projectId);
                    if (row.hasChildren) {
                      toggleExpanded(row.id);
                    }
                    return;
                  }

                  if (row.kind === "node") {
                    if (hierarchyMode === "by_project") {
                      const parsed = parseCompositeNodeRowId(row.id);
                      if (!parsed) {
                        return;
                      }
                      onSelectNode?.(parsed.nodeId, parsed.projectId);
                    } else {
                      const nodeId = row.id.replace(/^node:/, "");
                      onSelectNode?.(nodeId, selectedProjectId ?? "");
                    }
                    if (row.hasChildren) {
                      toggleExpanded(row.id);
                    }
                    return;
                  }

                  const workspaceId = row.id.replace(/^workspace:/, "");
                  const workspace = workspaceById.get(workspaceId);
                  if (!workspace) {
                    return;
                  }

                  onSelectWorkspace?.(workspaceId, workspace.projectId, workspace.nodeId);
                }}
              />
            </Box>
          );
        })}
        {dropIndicatorTop === null ? null : (
          <Box
            sx={{
              position: "absolute",
              left: 8,
              right: 8,
              top: dropIndicatorTop - 1,
              height: 2,
              borderRadius: 1,
              bgcolor: "primary.main",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        )}
      </Box>
    </Box>
  );
}
