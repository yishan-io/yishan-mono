import { Box, IconButton, Tooltip } from "@mui/material";
import { GitChangeTotals } from "@renderer/domains/git";
import type { MouseEvent } from "react";
import { LuArchive, LuEllipsis, LuPlus } from "react-icons/lu";
import type { WorkspaceTreeRow } from "./types";

type WorkspaceTreeRowActionsProps = {
  row: WorkspaceTreeRow;
  workspaceId: string;
  deleteWorkspaceLabel?: string;
  createWorkspaceTooltipLabel?: string;
  onWorkspaceRequestDelete?: () => void;
  onProjectCreateWorkspaceClick?: (event: MouseEvent<HTMLElement>) => void;
  onProjectActionsClick?: (event: MouseEvent<HTMLElement>) => void;
};

/** Render workspace and project actions at the end of a tree row. */
export function WorkspaceTreeRowActions({
  row,
  workspaceId,
  deleteWorkspaceLabel,
  createWorkspaceTooltipLabel,
  onWorkspaceRequestDelete,
  onProjectCreateWorkspaceClick,
  onProjectActionsClick,
}: WorkspaceTreeRowActionsProps) {
  if (row.kind === "workspace") {
    return (
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
        {row.workspaceKind === "local" || row.isLocalFolder ? null : (
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
            <Tooltip title={deleteWorkspaceLabel ?? "Close workspace"}>
              <IconButton
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
          </Box>
        )}
      </Box>
    );
  }

  if (row.kind !== "project") {
    return null;
  }

  return (
    <>
      {row.supportsGitFeatures !== false ? (
        <Tooltip title={createWorkspaceTooltipLabel ?? "workspace.actions.add"}>
          <IconButton
            className="project-actions"
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
      ) : null}
      {row.isLocalFolderGroup ? null : (
        <IconButton
          className="project-actions"
          aria-label="Project actions"
          onClick={(event) => {
            event.stopPropagation();
            onProjectActionsClick?.(event);
          }}
          // With no add-workspace button (non-git projects) the auto margin
          // moves here so the actions stay pinned to the row's right edge.
          sx={row.supportsGitFeatures === false ? { ml: "auto" } : undefined}
        >
          <LuEllipsis size={14} />
        </IconButton>
      )}
    </>
  );
}
