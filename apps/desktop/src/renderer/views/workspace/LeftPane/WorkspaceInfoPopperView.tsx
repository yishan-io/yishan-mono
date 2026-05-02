import { Box, Paper, Popper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuGitBranch } from "react-icons/lu";
import type { RepoWorkspaceItem } from "../../../store/types";

type WorkspaceInfoPopperViewProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  workspace: RepoWorkspaceItem | undefined;
  /** Live current branch read from the workspace path via the daemon. */
  currentBranch?: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/** Renders hover popper with workspace name and branch metadata. */
export function WorkspaceInfoPopperView({
  open,
  anchorEl,
  workspace,
  currentBranch,
  onMouseEnter,
  onMouseLeave,
}: WorkspaceInfoPopperViewProps) {
  const { t } = useTranslation();
  const displayBranch = currentBranch || workspace?.branch || t("workspace.info.unavailable");
  const sourceBranch = workspace?.sourceBranch?.trim();
  const showSourceBranch = Boolean(sourceBranch && sourceBranch !== displayBranch);

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="right-start"
      modifiers={[
        {
          name: "offset",
          options: {
            offset: [8, 0],
          },
        },
      ]}
      sx={{ zIndex: (theme) => theme.zIndex.tooltip }}
    >
      <Paper
        data-testid="workspace-info-popper"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        elevation={4}
        sx={{
          px: 1.25,
          py: 1,
          borderRadius: 1,
          minWidth: 220,
          maxWidth: 320,
        }}
      >
        <Stack spacing={0.75}>
          <Typography
            variant="subtitle2"
            sx={{
              lineHeight: 1.2,
              color: "text.primary",
            }}
            noWrap
          >
            {workspace?.name}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <LuGitBranch size={14} />
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              <Box component="span" sx={{ textTransform: "uppercase", letterSpacing: 0.4, color: "info.main" }}>
                {t("workspace.info.branch")}:
              </Box>{" "}
              {displayBranch}
            </Typography>
          </Stack>
          {showSourceBranch ? (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <LuGitBranch size={14} />
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                <Box component="span" sx={{ textTransform: "uppercase", letterSpacing: 0.4, color: "info.main" }}>
                  {t("workspace.info.sourceBranch")}:
                </Box>{" "}
                {sourceBranch}
              </Typography>
            </Stack>
          ) : null}
        </Stack>
      </Paper>
    </Popper>
  );
}
