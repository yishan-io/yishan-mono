import { Box, IconButton, Tooltip, useTheme } from "@mui/material";
import type { DragEvent, MouseEvent } from "react";
import { CgSpinner } from "react-icons/cg";
import { HiCubeTransparent, HiOutlineCube } from "react-icons/hi2";
import { LuChevronRight, LuCloud, LuFolder, LuFolderOpen, LuLaptop, LuServer } from "react-icons/lu";
import { LuEllipsis } from "react-icons/lu";
import { LuPlus } from "react-icons/lu";
import { LuArchive } from "react-icons/lu";
import { LuTrash2, LuWrench } from "react-icons/lu";
import { CliSpinner } from "../CliSpinner";
import { GitChangeTotals } from "../GitChangeTotals";
import { renderProjectIcon } from "../projectIcons";
import type { WorkspaceTreeRow } from "./types";

export const WORKSPACE_TREE_ROW_HEIGHT = 30;

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
  onWorkspaceRequestRepair?: () => void;
  onWorkspaceRequestForget?: () => void;
  createWorkspaceTooltipLabel?: string;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
};

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
  onWorkspaceRequestRepair,
  onWorkspaceRequestForget,
  createWorkspaceTooltipLabel,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: WorkspaceTreeRowViewProps) {
  const theme = useTheme();
  const isFolderLike = row.kind !== "workspace";
  const workspaceId = row.kind === "workspace" ? row.id.replace(/^workspace:/, "") : "";
  const isBroken = row.lifecycleState && row.lifecycleState !== "active";
  const workspaceIconColor =
    row.notificationTone === "waiting_input"
      ? "warning.main"
      : row.notificationTone === "done"
        ? "success.main"
        : row.notificationTone === "failed"
          ? "error.main"
          : "text.secondary";

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
          size="small"
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
      {row.kind === "project" ? (
        <Box
          component="span"
          sx={{
            width: 20,
            height: 20,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: row.color ?? theme.palette.primary.main,
            color: theme.palette.common.white,
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 0.5,
          }}
        >
          {renderProjectIcon(row.icon ?? undefined, 12)}
        </Box>
      ) : row.kind === "node" ? (
        <Box component="span" sx={{ width: 16, height: 16, display: "inline-flex", color: "text.secondary" }}>
          {row.nodeKind === "managed" ? (
            <LuLaptop size={16} />
          ) : row.nodeScope === "shared" ? (
            <LuCloud size={16} />
          ) : (
            <LuServer size={16} />
          )}
        </Box>
      ) : row.kind === "workspace" ? (
        <Box component="span" sx={{ width: 16, height: 16, display: "inline-flex", color: workspaceIconColor }}>
          {row.isCreating ? (
            <Box
              component="span"
              data-testid={`workspace-creating-spinner-${workspaceId}`}
              sx={{
                display: "inline-flex",
                "@keyframes workspace-creating-spin": {
                  from: { transform: "rotate(0deg)" },
                  to: { transform: "rotate(360deg)" },
                },
                animation: "workspace-creating-spin 1s linear infinite",
              }}
            >
              <CgSpinner size={16} />
            </Box>
          ) : row.runtimeStatus === "running" ? (
            <Box component="span" data-testid={`workspace-status-running-spinner-${workspaceId}`}>
              <CliSpinner fontSize={20} />
            </Box>
          ) : row.workspaceKind === "local" ? (
            <HiOutlineCube
              size={16}
              data-testid={
                row.notificationTone === "waiting_input"
                  ? `workspace-status-waiting-input-badge-${workspaceId}`
                  : row.notificationTone === "done"
                    ? `workspace-status-done-badge-${workspaceId}`
                    : row.notificationTone === "failed"
                      ? `workspace-status-failed-badge-${workspaceId}`
                      : `workspace-kind-local-${workspaceId}`
              }
            />
          ) : (
            <HiCubeTransparent
              size={16}
              data-testid={
                row.notificationTone === "waiting_input"
                  ? `workspace-status-waiting-input-badge-${workspaceId}`
                  : row.notificationTone === "done"
                    ? `workspace-status-done-badge-${workspaceId}`
                    : row.notificationTone === "failed"
                      ? `workspace-status-failed-badge-${workspaceId}`
                      : `workspace-icon-${workspaceId}`
              }
            />
          )}
        </Box>
      ) : (
        <Box sx={{ width: 16, height: 16, color: row.kind === "workspace" ? "text.secondary" : "primary.main" }}>
          {isFolderLike && isExpanded ? <LuFolderOpen size={16} /> : <LuFolder size={16} />}
        </Box>
      )}
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
      {row.kind === "workspace" ? (
        <Box sx={{ ml: "auto", minWidth: 84, position: "relative", display: "flex", justifyContent: "flex-end" }}>
          {(row.additions ?? 0) > 0 || (row.deletions ?? 0) > 0 ? (
            <GitChangeTotals
              className="workspace-change-totals"
              testId={`workspace-change-totals-${workspaceId}`}
              additions={row.additions ?? 0}
              deletions={row.deletions ?? 0}
              sx={{ justifyContent: "flex-end", width: "100%", flexShrink: 0 }}
            />
          ) : null}
          {row.workspaceKind === "local" ? null : (
            <Box
              className="workspace-actions"
              data-testid={`workspace-actions-${workspaceId}`}
              sx={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 0,
              }}
            >
              {row.lifecycleState && row.lifecycleState !== "active" ? (
                <>
                  <Tooltip title="Repair workspace">
                    <IconButton
                      size="small"
                      aria-label="Repair workspace"
                      onClick={(event) => {
                        event.stopPropagation();
                        onWorkspaceRequestRepair?.();
                      }}
                      sx={{ width: 24, height: 24 }}
                    >
                      <LuWrench size={13} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Forget workspace">
                    <IconButton
                      size="small"
                      aria-label="Forget workspace"
                      onClick={(event) => {
                        event.stopPropagation();
                        onWorkspaceRequestForget?.();
                      }}
                      sx={{ width: 24, height: 24 }}
                    >
                      <LuTrash2 size={13} />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                <Tooltip title={deleteWorkspaceLabel ?? "Close workspace"}>
                  <IconButton
                    size="small"
                    aria-label={deleteWorkspaceLabel ?? "Close workspace"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onWorkspaceRequestDelete?.();
                    }}
                    sx={{ width: 24, height: 24 }}
                  >
                    <LuArchive size={13} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}
        </Box>
      ) : null}
      {row.kind === "project" ? (
        <>
          <Tooltip title={createWorkspaceTooltipLabel ?? "workspace.actions.add"}>
            <IconButton
              className="project-actions"
              size="small"
              aria-label="workspace.actions.add"
              onClick={(event) => {
                event.stopPropagation();
                onProjectCreateWorkspaceClick?.(event);
              }}
              sx={{ ml: "auto" }}
            >
              <LuPlus size={14} />
            </IconButton>
          </Tooltip>
          <IconButton
            className="project-actions"
            size="small"
            aria-label="Project actions"
            onClick={(event) => {
              event.stopPropagation();
              onProjectActionsClick?.(event);
            }}
          >
            <LuEllipsis size={14} />
          </IconButton>
        </>
      ) : null}
    </Box>
  );
}
