import { Box } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { WORKSPACE_TREE_ROW_HEIGHT } from "./WorkspaceTreeRow";
import { WorkspaceTreeRows } from "./WorkspaceTreeRows";
import type { WorkspaceTreeProps } from "./types";
import { useVisibleWorkspaceTree } from "./useVisibleWorkspaceTree";
import { useWorkspaceTreeDragAndDrop } from "./useWorkspaceTreeDragAndDrop";
import { parseWorkspaceRowId } from "./workspaceTreeRowId";

/** Render the workspace tree. */
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
  onWorkspaceRequestRepair,
  onWorkspaceRequestForget,
  createWorkspaceTooltipLabel,
  onProjectCreateWorkspaceClick,
  onProjectActionsClick,
  onRowReorder,
}: WorkspaceTreeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
  const workspaceRows = useMemo(() => visibleRows.filter((row) => row.kind === "workspace"), [visibleRows]);
  const selectedWorkspaceRowIndex = useMemo(() => {
    if (!selectedWorkspaceId) {
      return -1;
    }

    return workspaceRows.findIndex((row) => row.id === `workspace:${selectedWorkspaceId}`);
  }, [selectedWorkspaceId, workspaceRows]);

  const { dropIndicatorTop, handleDragEnd, handleDragOver, handleDragStart, handleDrop } = useWorkspaceTreeDragAndDrop({
    visibleRows,
    rowById,
    onRowReorder,
  });

  const virtualRows =
    virtualizer.getVirtualItems().length > 0
      ? virtualizer.getVirtualItems()
      : visibleRows.map((_, index) => ({ index, key: index, start: index * WORKSPACE_TREE_ROW_HEIGHT }));

  return (
    <Box
      ref={scrollRef}
      role="tree"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
          return;
        }

        if (workspaceRows.length === 0) {
          return;
        }

        event.preventDefault();
        const nextIndex =
          event.key === "ArrowUp"
            ? selectedWorkspaceRowIndex <= 0
              ? workspaceRows.length - 1
              : selectedWorkspaceRowIndex - 1
            : selectedWorkspaceRowIndex < 0 || selectedWorkspaceRowIndex >= workspaceRows.length - 1
              ? 0
              : selectedWorkspaceRowIndex + 1;
        const nextWorkspaceRow = workspaceRows[nextIndex];
        if (!nextWorkspaceRow) {
          return;
        }

        const nextWorkspaceId = parseWorkspaceRowId(nextWorkspaceRow.id);
        const nextWorkspace = workspaceById.get(nextWorkspaceId);
        if (!nextWorkspace) {
          return;
        }

        const nextVisibleRowIndex = visibleRows.findIndex((row) => row.id === nextWorkspaceRow.id);
        if (nextVisibleRowIndex >= 0) {
          virtualizer.scrollToIndex(nextVisibleRowIndex, { align: "auto" });
        }

        onSelectWorkspace?.(nextWorkspaceId, nextWorkspace.projectId, nextWorkspace.nodeId);
      }}
      sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1 }}
    >
      <Box sx={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        <WorkspaceTreeRows
          createWorkspaceTooltipLabel={createWorkspaceTooltipLabel}
          deleteWorkspaceLabel={deleteWorkspaceLabel}
          hierarchyMode={hierarchyMode}
          isExpanded={isExpanded}
          onDragEndRow={handleDragEnd}
          onDragOverRow={handleDragOver}
          onDragStartRow={handleDragStart}
          onDropRow={handleDrop}
          onProjectActionsClick={onProjectActionsClick}
          onProjectContextMenu={onProjectContextMenu}
          onProjectCreateWorkspaceClick={onProjectCreateWorkspaceClick}
          onSelectNode={onSelectNode}
          onSelectProject={onSelectProject}
          onSelectWorkspace={onSelectWorkspace}
          onWorkspaceContextMenu={onWorkspaceContextMenu}
          onWorkspaceMouseEnter={onWorkspaceMouseEnter}
          onWorkspaceMouseLeave={onWorkspaceMouseLeave}
          onWorkspaceRequestDelete={onWorkspaceRequestDelete}
          onWorkspaceRequestForget={onWorkspaceRequestForget}
          onWorkspaceRequestRepair={onWorkspaceRequestRepair}
          scrollRef={scrollRef}
          selectedNodeId={selectedNodeId}
          selectedProjectId={selectedProjectId}
          selectedWorkspaceId={selectedWorkspaceId}
          toggleExpanded={toggleExpanded}
          virtualRows={virtualRows}
          visibleRows={visibleRows}
          workspaceById={workspaceById}
        />
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
