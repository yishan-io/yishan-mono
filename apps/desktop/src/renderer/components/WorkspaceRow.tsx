import {
  Box,
  IconButton,
  ListItem,
  ListItemButton,
  Stack,
  type Theme,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import type { MouseEvent as ReactMouseEvent } from "react";
import { HiCubeTransparent, HiOutlineCube } from "react-icons/hi2";
import { LuArchive, LuLoaderCircle } from "react-icons/lu";
import { buildListItemButtonSx } from "../helpers/leftPaneStyles";
import type { WorkspaceGitChangeTotals, WorkspaceItem } from "../store/types";
import { workspaceCreateProgressStore } from "../store/workspaceCreateProgressStore";
import { CliSpinner } from "./CliSpinner";
import { GitChangeTotals } from "./GitChangeTotals";

export type WorkspaceRowIndicator = "running" | "waiting_input" | "done" | "failed" | "none";
type WorkspaceBadgeIndicator = Extract<WorkspaceRowIndicator, "waiting_input" | "failed" | "done">;

const INDICATOR_PALETTE_KEY: Record<WorkspaceBadgeIndicator, "success" | "error" | "warning"> = {
  done: "success",
  failed: "error",
  waiting_input: "warning",
};

const INDICATOR_TEST_ID_SLUG: Record<WorkspaceBadgeIndicator, string> = {
  waiting_input: "waiting-input",
  done: "done",
  failed: "failed",
};

type WorkspaceRowProps = {
  repoId: string;
  workspace: WorkspaceItem;
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
  const additions = changeTotals?.additions ?? 0;
  const deletions = changeTotals?.deletions ?? 0;
  const shouldShowChangeTotals = additions > 0 || deletions > 0;
  const workspaceCreateProgress = workspaceCreateProgressStore((state) => state.progressByWorkspaceId[workspace.id]);
  const isSetupRunning = Boolean(workspaceCreateProgress && !workspaceCreateProgress.isComplete);

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

    if (isSetupRunning) {
      return (
        <Box
          component="span"
          data-testid={`workspace-setup-spinner-${workspace.id}`}
          sx={{
            display: "inline-flex",
            mt: 0.375,
            color: "text.secondary",
            "@keyframes workspace-setup-spin": {
              from: { transform: "rotate(0deg)" },
              to: { transform: "rotate(360deg)" },
            },
            "& .setup-spin": {
              animation: "workspace-setup-spin 1s linear infinite",
            },
          }}
        >
          <LuLoaderCircle size={16} className="setup-spin" />
        </Box>
      );
    }

    const indicatorColor =
      indicator in INDICATOR_PALETTE_KEY
        ? theme.palette[INDICATOR_PALETTE_KEY[indicator as WorkspaceBadgeIndicator]].main
        : undefined;

    const badgeTestId =
      indicator in INDICATOR_TEST_ID_SLUG
        ? `workspace-status-${INDICATOR_TEST_ID_SLUG[indicator as WorkspaceBadgeIndicator]}-badge-${workspace.id}`
        : null;

    const indicatorLabelMap: Record<WorkspaceBadgeIndicator, string> = {
      waiting_input: waitingInputIndicatorLabel,
      done: doneIndicatorLabel,
      failed: failedIndicatorLabel,
    };
    const indicatorLabel =
      indicator in indicatorLabelMap ? indicatorLabelMap[indicator as WorkspaceBadgeIndicator] : undefined;

    return (
      <Box
        component="span"
        data-testid={badgeTestId ?? `workspace-icon-${workspace.id}`}
        role={indicatorColor ? "img" : undefined}
        aria-label={indicatorLabel}
        sx={{ display: "inline-flex", mt: 0.375, color: indicatorColor ?? "text.secondary" }}
      >
        {isLocalWorkspace ? (
          <HiOutlineCube size={16} data-testid={`workspace-kind-local-${workspace.id}`} />
        ) : (
          <HiCubeTransparent size={16} />
        )}
      </Box>
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
          py: 0.5,
          pl: 3,
          pr: 2,
          minHeight: 24,
          ...buildListItemButtonSx(theme),
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
