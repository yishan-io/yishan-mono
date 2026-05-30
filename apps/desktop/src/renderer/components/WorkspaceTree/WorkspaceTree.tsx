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

export function WorkspaceTree({
  projects,
  nodes,
  workspaces,
  selectedProjectId,
  selectedNodeId,
  selectedWorkspaceId,
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
  onProjectCreateWorkspaceClick,
  onProjectActionsClick,
}: WorkspaceTreeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const workspaceById = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace])), [workspaces]);

  const { visibleRows, isExpanded, toggleExpanded } = useVisibleWorkspaceTree({
    projects,
    nodes,
    workspaces,
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
        {virtualizer.getVirtualItems().map((item) => {
          const row = visibleRows[item.index];
          if (!row) {
            return null;
          }

          const expanded = row.hasChildren && isExpanded(row.id);
          const isSelected =
            (row.kind === "project" && !selectedWorkspaceId && row.id === `project:${selectedProjectId ?? ""}`) ||
            (row.kind === "node" && row.id === `node:${selectedProjectId ?? ""}:${selectedNodeId ?? ""}`) ||
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
                deleteWorkspaceLabel={deleteWorkspaceLabel}
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
                    const projectId = row.id.replace(/^project:/, "");
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

                  const projectId = row.id.replace(/^project:/, "");
                  onProjectActionsClick?.(event, projectId);
                }}
                onProjectCreateWorkspaceClick={(event) => {
                  if (row.kind !== "project") {
                    return;
                  }

                  const projectId = row.id.replace(/^project:/, "");
                  onProjectCreateWorkspaceClick?.(event, projectId);
                }}
                onClick={() => {
                  if (row.kind === "project") {
                    const projectId = row.id.replace(/^project:/, "");
                    onSelectProject?.(projectId);
                    if (row.hasChildren) {
                      toggleExpanded(row.id);
                    }
                    return;
                  }

                  if (row.kind === "node") {
                    const parsed = parseCompositeNodeRowId(row.id);
                    if (!parsed) {
                      return;
                    }

                    onSelectNode?.(parsed.nodeId, parsed.projectId);
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
