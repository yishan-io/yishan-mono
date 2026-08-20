import { Box, IconButton, Tooltip } from "@mui/material";
import type { DragEvent, MouseEvent } from "react";
import { LuChevronRight, LuTriangleAlert } from "react-icons/lu";
import { WorkspaceTreeRowActions } from "./WorkspaceTreeRowActions";
import { WorkspaceTreeRowIcon } from "./WorkspaceTreeRowIcon";
import type { WorkspaceTreeRow } from "./types";

export const WORKSPACE_TREE_ROW_HEIGHT = 30;

function workspaceErrorTooltip(health?: string): string {
  return health === "not-worktree"
    ? "Workspace path is not a git worktree — close to remove"
    : "Workspace worktree is missing — close to remove";
}

type WorkspaceTreeRowViewProps = {
  row: WorkspaceTreeRow;
  isExpanded: boolean;
  isSelected: boolean;
  onClick: () => void;
  onToggle?: () => void;
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
  onMouseOver?: () => void;
  onMouseLeave?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  onProjectCreateWorkspaceClick?: (event: MouseEvent<HTMLElement>) => void;
  onProjectActionsClick?: (event: MouseEvent<HTMLElement>) => void;
  deleteWorkspaceLabel?: string;
  onWorkspaceRequestDelete?: () => void;
  createWorkspaceTooltipLabel?: string;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
};

/** Render a single interactive row in the workspace tree. */
export function WorkspaceTreeRowView({
  row,
  isExpanded,
  isSelected,
  onClick,
  onToggle,
  onMouseEnter,
  onMouseOver,
  onMouseLeave,
  onContextMenu,
  onProjectCreateWorkspaceClick,
  onProjectActionsClick,
  deleteWorkspaceLabel,
  onWorkspaceRequestDelete,
  createWorkspaceTooltipLabel,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: WorkspaceTreeRowViewProps) {
  const isFolderLike = row.kind !== "workspace";
  const workspaceId = row.kind === "workspace" ? row.id.replace(/^workspace:/, "") : "";
  const isBroken = row.lifecycleState === "error";

  return (
    <Box
      data-testid={row.kind === "workspace" ? `workspace-row-${workspaceId}` : undefined}
      role="treeitem"
      aria-expanded={isFolderLike ? isExpanded : undefined}
      draggable={draggable}
      onClick={onClick}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.(event);
      }}
      onDragOver={(event) => {
        onDragOver?.(event);
      }}
      onDrop={(event) => {
        onDrop?.(event);
      }}
      onDragEnd={(event) => {
        onDragEnd?.(event);
      }}
      onMouseEnter={onMouseEnter}
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      sx={{
        height: WORKSPACE_TREE_ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        pl: row.depth * 1.25 + 1,
        pr: 1,
        borderRadius: 1,
        cursor: "pointer",
        userSelect: "none",
        bgcolor: isSelected ? "action.selected" : "transparent",
        "&:hover": {
          bgcolor: isSelected ? "action.selected" : "action.hover",
        },
        "& .project-actions": {
          opacity: 0,
          pointerEvents: "none",
          transition: "opacity 0.15s ease",
        },
        "&:hover .project-actions, &:focus-within .project-actions": {
          opacity: 1,
          pointerEvents: "auto",
        },
        "& .workspace-actions": {
          opacity: 0,
          pointerEvents: "none",
          transition: "opacity 0.15s ease",
        },
        "& .workspace-change-totals": {
          opacity: 1,
          transition: "opacity 0.15s ease",
        },
        "&:hover .workspace-actions, &:focus-within .workspace-actions": {
          opacity: 1,
          pointerEvents: "auto",
        },
        "&:hover .workspace-change-totals, &:focus-within .workspace-change-totals": {
          opacity: 0,
          pointerEvents: "none",
        },
      }}
    >
      {row.hasChildren ? (
        <IconButton
          aria-label={
            row.kind === "project"
              ? isExpanded
                ? "repo.actions.collapse"
                : "repo.actions.expand"
              : isExpanded
                ? "node.actions.collapse"
                : "node.actions.expand"
          }
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.();
          }}
          sx={{
            width: 24,
            height: 24,
            color: "text.secondary",
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          <LuChevronRight />
        </IconButton>
      ) : (
        <Box sx={{ width: 20, height: 20, mr: 0.5 }} />
      )}
      <WorkspaceTreeRowIcon row={row} isExpanded={isExpanded} workspaceId={workspaceId} />
      <Box
        component="span"
        data-testid={row.kind === "workspace" ? `workspace-name-${workspaceId}` : undefined}
        className={row.kind === "workspace" ? "MuiTypography-noWrap" : undefined}
        sx={{
          ml: 0.75,
          typography: "body2",
          fontSize: row.kind === "project" ? 14 : undefined,
          color: isBroken ? "error.main" : "text.primary",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {row.label}
      </Box>
      {row.kind === "workspace" && row.lifecycleState === "error" ? (
        <Tooltip title={workspaceErrorTooltip(row.health)}>
          <Box
            component="span"
            data-testid={`workspace-error-badge-${workspaceId}`}
            sx={{ ml: 0.5, display: "inline-flex", color: "error.main" }}
          >
            <LuTriangleAlert size={14} />
          </Box>
        </Tooltip>
      ) : null}
      <WorkspaceTreeRowActions
        row={row}
        workspaceId={workspaceId}
        deleteWorkspaceLabel={deleteWorkspaceLabel}
        createWorkspaceTooltipLabel={createWorkspaceTooltipLabel}
        onWorkspaceRequestDelete={onWorkspaceRequestDelete}
        onProjectCreateWorkspaceClick={onProjectCreateWorkspaceClick}
        onProjectActionsClick={onProjectActionsClick}
      />
    </Box>
  );
}
