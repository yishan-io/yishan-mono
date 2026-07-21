import { Box } from "@mui/material";
import type { DragEvent, RefObject } from "react";
import { WorkspaceTreeRowView } from "./WorkspaceTreeRow";
import type { WorkspaceTreeProps, WorkspaceTreeRow, WorkspaceTreeWorkspace } from "./types";
import {
  isWorkspaceTreeRowSelected,
  parseCompositeNodeRowId,
  parseProjectRowId,
  parseWorkspaceRowId,
} from "./workspaceTreeRowId";

type VirtualRowItem = {
  index: number;
  key: string | number | bigint;
  start: number;
};

interface WorkspaceTreeRowsProps
  extends Pick<
    WorkspaceTreeProps,
    | "createWorkspaceTooltipLabel"
    | "deleteWorkspaceLabel"
    | "hierarchyMode"
    | "onProjectActionsClick"
    | "onProjectContextMenu"
    | "onProjectCreateWorkspaceClick"
    | "onSelectNode"
    | "onSelectProject"
    | "onSelectWorkspace"
    | "onWorkspaceContextMenu"
    | "onWorkspaceMouseEnter"
    | "onWorkspaceMouseLeave"
    | "onWorkspaceRequestDelete"
    | "onWorkspaceRequestForget"
    | "onWorkspaceRequestRepair"
    | "selectedNodeId"
    | "selectedProjectId"
    | "selectedWorkspaceId"
  > {
  visibleRows: WorkspaceTreeRow[];
  virtualRows: VirtualRowItem[];
  workspaceById: Map<string, WorkspaceTreeWorkspace>;
  isExpanded: (id: string) => boolean;
  toggleExpanded: (id: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  onDragStartRow: (row: WorkspaceTreeRow) => void;
  onDragOverRow: (event: DragEvent<HTMLElement>, row: WorkspaceTreeRow) => void;
  onDropRow: (event: DragEvent<HTMLElement>) => void;
  onDragEndRow: () => void;
}

/** Render the visible workspace tree rows. */
export function WorkspaceTreeRows({
  createWorkspaceTooltipLabel,
  deleteWorkspaceLabel,
  hierarchyMode = "by_project",
  isExpanded,
  onDragEndRow,
  onDragOverRow,
  onDragStartRow,
  onDropRow,
  onProjectActionsClick,
  onProjectContextMenu,
  onProjectCreateWorkspaceClick,
  onSelectNode,
  onSelectProject,
  onSelectWorkspace,
  onWorkspaceContextMenu,
  onWorkspaceMouseEnter,
  onWorkspaceMouseLeave,
  onWorkspaceRequestDelete,
  onWorkspaceRequestForget,
  onWorkspaceRequestRepair,
  scrollRef,
  selectedNodeId,
  selectedProjectId,
  selectedWorkspaceId,
  toggleExpanded,
  virtualRows,
  visibleRows,
  workspaceById,
}: WorkspaceTreeRowsProps) {
  return virtualRows.map((item) => {
    const row = visibleRows[item.index];
    if (!row) {
      return null;
    }

    const isSelected = isWorkspaceTreeRowSelected({
      row,
      hierarchyMode,
      selectedProjectId,
      selectedNodeId,
      selectedWorkspaceId,
    });

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
          isExpanded={row.hasChildren && isExpanded(row.id)}
          isSelected={isSelected}
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = "move";
            onDragStartRow(row);
          }}
          onDragOver={(event) => {
            onDragOverRow(event, row);
          }}
          onDrop={onDropRow}
          onDragEnd={onDragEndRow}
          onToggle={() => {
            if (row.hasChildren) {
              toggleExpanded(row.id);
            }
          }}
          deleteWorkspaceLabel={deleteWorkspaceLabel}
          createWorkspaceTooltipLabel={createWorkspaceTooltipLabel}
          onWorkspaceRequestDelete={() => {
            if (row.kind !== "workspace") {
              return;
            }

            const workspaceId = parseWorkspaceRowId(row.id);
            const workspace = workspaceById.get(workspaceId);
            if (workspace) {
              onWorkspaceRequestDelete?.(workspaceId, workspace.projectId);
            }
          }}
          onWorkspaceRequestRepair={() => {
            if (row.kind === "workspace") {
              onWorkspaceRequestRepair?.(parseWorkspaceRowId(row.id));
            }
          }}
          onWorkspaceRequestForget={() => {
            if (row.kind === "workspace") {
              onWorkspaceRequestForget?.(parseWorkspaceRowId(row.id));
            }
          }}
          onMouseEnter={(event) => {
            if (row.kind === "workspace") {
              onWorkspaceMouseEnter?.(event, parseWorkspaceRowId(row.id));
            }
          }}
          onMouseLeave={() => {
            if (row.kind === "workspace") {
              onWorkspaceMouseLeave?.();
            }
          }}
          onContextMenu={(event) => {
            if (row.kind === "project") {
              onProjectContextMenu?.(event, parseProjectRowId(row.id)?.projectId ?? "");
              return;
            }

            if (row.kind !== "workspace") {
              return;
            }

            const workspaceId = parseWorkspaceRowId(row.id);
            const workspace = workspaceById.get(workspaceId);
            if (workspace) {
              onWorkspaceContextMenu?.(event, workspaceId, workspace.projectId);
            }
          }}
          onProjectActionsClick={(event) => {
            if (row.kind === "project") {
              onProjectActionsClick?.(event, parseProjectRowId(row.id)?.projectId ?? "");
            }
          }}
          onProjectCreateWorkspaceClick={(event) => {
            if (row.kind === "project") {
              onProjectCreateWorkspaceClick?.(event, parseProjectRowId(row.id)?.projectId ?? "");
            }
          }}
          onClick={() => {
            scrollRef.current?.focus();
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
                const parsedRowId = parseCompositeNodeRowId(row.id);
                if (!parsedRowId) {
                  return;
                }
                onSelectNode?.(parsedRowId.nodeId, parsedRowId.projectId);
              } else {
                onSelectNode?.(row.id.replace(/^node:/, ""), selectedProjectId ?? "");
              }

              if (row.hasChildren) {
                toggleExpanded(row.id);
              }
              return;
            }

            const workspaceId = parseWorkspaceRowId(row.id);
            const workspace = workspaceById.get(workspaceId);
            if (workspace) {
              onSelectWorkspace?.(workspaceId, workspace.projectId, workspace.nodeId);
            }
          }}
        />
      </Box>
    );
  });
}
