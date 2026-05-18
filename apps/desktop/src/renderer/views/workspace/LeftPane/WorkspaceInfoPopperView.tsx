import { Box, Paper, Popper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuGitBranch } from "react-icons/lu";
import type { WorkspacePullRequestSummary } from "../../../api/types";
import { PullRequestIcon } from "../../../components/PullRequestIcon";
import { livePrStatus } from "../../../helpers/pullRequestUtils";
import type { DaemonWorkspacePullRequest } from "../../../rpc/daemonTypes";
import type { RepoWorkspaceItem } from "../../../store/types";

type WorkspaceInfoPopperViewProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  workspace: RepoWorkspaceItem | undefined;
  isPrimaryWorkspace: boolean;
  /** Live current branch read from the workspace path via the daemon. */
  currentBranch?: string;
  pullRequest?: DaemonWorkspacePullRequest;
  /** Latest PR snapshot from the api-service — shown when no live daemon PR is available. */
  latestPullRequest?: WorkspacePullRequestSummary;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/** Renders hover popper with workspace name and branch metadata. */
export function WorkspaceInfoPopperView({
  open,
  anchorEl,
  workspace,
  isPrimaryWorkspace,
  currentBranch,
  pullRequest,
  latestPullRequest,
  onMouseEnter,
  onMouseLeave,
}: WorkspaceInfoPopperViewProps) {
  const { t } = useTranslation();
  const unavailableLabel = t("workspace.info.unavailable");
  const displayBranch = currentBranch?.trim() || workspace?.branch?.trim() || unavailableLabel;
  const sourceBranch = workspace?.sourceBranch?.trim() || "";
  const shouldShowSourceBranch = !isPrimaryWorkspace && Boolean(sourceBranch);
  const sourceBranchValue = sourceBranch || unavailableLabel;
  const showSourceBranch = shouldShowSourceBranch && sourceBranchValue !== displayBranch;

  // Prefer live daemon PR; fall back to latest snapshot from api-service.
  const prSection = pullRequest ? (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <PullRequestIcon state={livePrStatus(pullRequest)} size={14} />
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }} noWrap>
        #{pullRequest.number}
        {pullRequest.title ? ` ${pullRequest.title}` : ""}
      </Typography>
    </Stack>
  ) : latestPullRequest ? (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <PullRequestIcon
        state={latestPullRequest.state}
        isDraft={(latestPullRequest.metadata as Record<string, unknown> | null)?.isDraft as boolean | undefined}
        size={14}
      />
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }} noWrap>
        #{latestPullRequest.prId}
        {latestPullRequest.title ? ` ${latestPullRequest.title}` : ""}
      </Typography>
    </Stack>
  ) : null;

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
                {sourceBranchValue}
              </Typography>
            </Stack>
          ) : null}
          {pullRequest || latestPullRequest ? (
            <Stack spacing={0.25} sx={{ mt: 1 }}>
              <Typography
                variant="caption"
                sx={{ textTransform: "uppercase", letterSpacing: 0.4, color: "text.primary", lineHeight: 1.2 }}
              >
                {t("workspace.pr.tab")}
              </Typography>
              {prSection}
            </Stack>
          ) : null}
        </Stack>
      </Paper>
    </Popper>
  );
}
