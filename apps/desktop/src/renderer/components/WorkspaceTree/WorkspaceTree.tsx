import { Box } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { WORKSPACE_TREE_ROW_HEIGHT, WorkspaceTreeRowView } from "./WorkspaceTreeRow";
import type { WorkspaceTreeProps } from "./types";
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
                isExpanded={expanded}
                isSelected={isSelected}
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
      </Box>
    </Box>
  );
}
