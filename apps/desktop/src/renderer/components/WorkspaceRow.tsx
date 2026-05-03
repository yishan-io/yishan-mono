import { Box, IconButton, ListItem, ListItemButton, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import type { MouseEvent as ReactMouseEvent } from "react";
import { LuArchive, LuFolderGit2, LuMonitor } from "react-icons/lu";
import type { RepoWorkspaceItem, WorkspaceGitChangeTotals } from "../store/types";
import { CliSpinner } from "./CliSpinner";
import { GitChangeTotals } from "./GitChangeTotals";
import { StatusBadge } from "./StatusBadge";

export type WorkspaceRowIndicator = "running" | "waiting_input" | "done" | "failed" | "none";
type WorkspaceBadgeIndicator = Extract<WorkspaceRowIndicator, "waiting_input" | "failed" | "done">;

/** Narrows row indicators to the subset rendered as badge-wrapped icons. */
function isWorkspaceBadgeIndicator(indicator: WorkspaceRowIndicator): indicator is WorkspaceBadgeIndicator {
  return indicator === "waiting_input" || indicator === "failed" || indicator === "done";
}

/** Resolves the localized aria-label for one badge indicator. */
function resolveWorkspaceBadgeAriaLabel(
  indicator: WorkspaceBadgeIndicator,
  labels: {
    waitingInputIndicatorLabel: string;
    doneIndicatorLabel: string;
    failedIndicatorLabel: string;
  },
): string {
  if (indicator === "waiting_input") {
    return labels.waitingInputIndicatorLabel;
  }

  if (indicator === "done") {
    return labels.doneIndicatorLabel;
  }

  return labels.failedIndicatorLabel;
}

/** Resolves one stable test id for badge indicators. */
function resolveWorkspaceBadgeTestId(indicator: WorkspaceBadgeIndicator, workspaceId: string): string {
  if (indicator === "waiting_input") {
    return `workspace-status-waiting-input-badge-${workspaceId}`;
  }

  return `workspace-status-${indicator}-badge-${workspaceId}`;
}

type WorkspaceRowProps = {
  repoId: string;
  workspace: RepoWorkspaceItem;
  isSelected: boolean;
  indicator: WorkspaceRowIndicator;
  changeTotals?: WorkspaceGitChangeTotals;
  deleteWorkspaceLabel: string;
  runningIndicatorLabel: string;
  waitingInputIndicatorLabel: string;
  doneIndicatorLabel: string;
  failedIndicatorLabel: string;
  onSelect: () => void;
  onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onRequestDelete: (repoId: string, workspaceId: string) => void;
};

/** Renders one workspace row with rename, status indicator, and delete affordances. */
export function WorkspaceRow({
  repoId,
  workspace,
  isSelected,
  indicator,
  changeTotals,
  deleteWorkspaceLabel,
  runningIndicatorLabel,
  waitingInputIndicatorLabel,
  doneIndicatorLabel,
  failedIndicatorLabel,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
  onRequestDelete,
}: WorkspaceRowProps) {
  const theme = useTheme();
  const isLocalWorkspace = workspace.kind === "local";
  const badgeIndicator = isWorkspaceBadgeIndicator(indicator) ? indicator : null;
  const additions = changeTotals?.additions ?? 0;
  const deletions = changeTotals?.deletions ?? 0;
  const shouldShowChangeTotals = additions > 0 || deletions > 0;

  /** Renders the workspace icon, swapping to spinner on running and badge on terminal states. */
  const renderWorkspaceIcon = () => {
    if (indicator === "running") {
      return (
        <Box
          component="span"
          role="img"
          aria-label={runningIndicatorLabel}
          data-testid={`workspace-status-running-spinner-${workspace.id}`}
          sx={{
            width: 16,
            height: 16,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            mt: 0.375,
            pointerEvents: "none",
          }}
        >
          <CliSpinner fontSize={20} />
        </Box>
      );
    }

    const icon = (
      <Box component="span" data-testid={`workspace-icon-${workspace.id}`} sx={{ display: "inline-flex", mt: 0.375 }}>
        {isLocalWorkspace ? (
          <LuMonitor size={16} data-testid={`workspace-kind-local-${workspace.id}`} />
        ) : (
          <LuFolderGit2 size={16} />
        )}
      </Box>
    );

    if (!badgeIndicator) {
      return icon;
    }

    return (
      <StatusBadge
        indicator={badgeIndicator}
        icon={icon}
        ariaLabel={resolveWorkspaceBadgeAriaLabel(badgeIndicator, {
          waitingInputIndicatorLabel,
          doneIndicatorLabel,
          failedIndicatorLabel,
        })}
        testId={resolveWorkspaceBadgeTestId(badgeIndicator, workspace.id)}
      />
    );
  };

  return (
    <ListItem disablePadding>
      <ListItemButton
        data-testid={`workspace-row-${workspace.id}`}
        selected={isSelected}
        onClick={onSelect}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onContextMenu={onContextMenu}
        sx={{
          bgcolor: "transparent",
          py: 0.5,
          pl: 3,
          pr: 2,
          minHeight: 24,
          "&:hover, &:focus-visible": {
            bgcolor: theme.palette.mode === "dark" ? theme.palette.action.hover : "rgba(47, 122, 100, 0.1)",
          },
          "&.Mui-selected": {
            bgcolor: theme.palette.mode === "dark" ? theme.palette.action.selected : "rgba(211, 134, 17, 0.14)",
          },
          "&.Mui-selected:hover, &.Mui-selected:focus-visible": {
            bgcolor: theme.palette.mode === "dark" ? theme.palette.action.hover : "rgba(211, 134, 17, 0.2)",
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
          "&:hover .workspace-actions, &:focus-visible .workspace-actions": {
            opacity: 1,
            pointerEvents: "auto",
          },
          "&:hover .workspace-change-totals, &:focus-visible .workspace-change-totals": {
            opacity: 0,
            pointerEvents: "none",
          },
        }}
      >
        <Stack direction="row" gap={1} sx={{ width: "100%" }}>
          {renderWorkspaceIcon()}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              data-testid={`workspace-name-${workspace.id}`}
              fontSize={14}
              color="text.primary"
              noWrap
              sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {workspace.name}
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              position: "relative",
              minWidth: 84,
            }}
          >
            {shouldShowChangeTotals ? (
              <GitChangeTotals
                className={isLocalWorkspace ? undefined : "workspace-change-totals"}
                testId={`workspace-change-totals-${workspace.id}`}
                additions={additions}
                deletions={deletions}
                sx={{
                  justifyContent: "flex-end",
                  width: "100%",
                  flexShrink: 0,
                }}
              />
            ) : null}
            {isLocalWorkspace ? null : (
              <Box
                className="workspace-actions"
                data-testid={`workspace-actions-${workspace.id}`}
                sx={{
                  position: "absolute",
                  right: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Tooltip title={deleteWorkspaceLabel} arrow>
                  <IconButton
                    size="small"
                    aria-label={deleteWorkspaceLabel}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequestDelete(repoId, workspace.id);
                    }}
                  >
                    <LuArchive size={13} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        </Stack>
      </ListItemButton>
    </ListItem>
  );
}
