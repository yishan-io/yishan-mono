import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { openLink } from "@renderer/commands/appCommands";
import { BranchBadge } from "@renderer/components/BranchBadge";
import { PullRequestIcon } from "@renderer/components/PullRequestIcon";
import type { MergeMethod } from "@renderer/views/workspace/RightPane/pullRequestTab/pullRequestTabHelpers";
import type { PullRequestTabActionsState } from "@renderer/views/workspace/RightPane/pullRequestTab/usePullRequestTabActions";
import { useTranslation } from "react-i18next";
import { LuArrowRight, LuChevronDown, LuRefreshCw } from "react-icons/lu";

const refreshIconSx = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transformOrigin: "center",
  animation: "pr-refresh-spin 0.9s linear infinite",
  "@keyframes pr-refresh-spin": {
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
  },
};

type PullRequestHeaderSectionActions = PullRequestTabActionsState & {
  setMergeMethod: (method: MergeMethod) => void;
};

interface PullRequestHeaderSectionProps {
  actionError: string | null;
  actions: PullRequestHeaderSectionActions;
  hasLivePr: boolean;
  liveStatus: string | undefined;
  mergeEnabled: boolean;
  mergeMethod: MergeMethod;
  prBaseBranch: string | undefined;
  prBranch: string | undefined;
  prNumber: number | undefined;
  prOpen: boolean;
  prTitle: string | undefined;
  prUrl: string | undefined;
  worktreePath: string | undefined;
}

/** Renders the current pull request header and action controls. */
export default function PullRequestHeaderSection({
  actionError,
  actions,
  hasLivePr,
  liveStatus,
  mergeEnabled,
  mergeMethod,
  prBaseBranch,
  prBranch,
  prNumber,
  prOpen,
  prTitle,
  prUrl,
  worktreePath,
}: PullRequestHeaderSectionProps) {
  const { t } = useTranslation();

  const handleSelectMergeMethod = (method: MergeMethod) => {
    actions.setMergeMethod(method);
    actions.handleCloseMergeMenu();
  };

  return (
    <>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center">
          <PullRequestIcon state={hasLivePr ? (liveStatus ?? "open") : "open"} size={18} />
          <Typography variant="subtitle1" noWrap sx={{ flex: 1, minWidth: 0 }}>
            #{prNumber}
            {prTitle ? ` ${prTitle}` : ""}
          </Typography>
          {liveStatus === "approved" ? (
            <Chip size="small" color="success" variant="outlined" label={t("workspace.pr.approved")} />
          ) : null}
          <Tooltip title={actions.isRefreshing ? t("workspace.pr.refreshing") : t("workspace.pr.refresh")}>
            <span>
              <IconButton
                aria-label={t("workspace.pr.refresh")}
                onClick={() => void actions.handleRefresh()}
                disabled={actions.isRefreshing || !worktreePath}
              >
                <Box component="span" sx={actions.isRefreshing ? refreshIconSx : undefined}>
                  <LuRefreshCw size={16} />
                </Box>
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, overflow: "hidden", mt: 0.25 }}>
          <BranchBadge name={prBranch || t("workspace.info.unavailable")} />
          <Box sx={{ flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
            <LuArrowRight size={13} color="currentColor" />
          </Box>
          <BranchBadge name={prBaseBranch || t("workspace.info.unavailable")} />
        </Box>
        {prUrl ? (
          <Link
            component="button"
            type="button"
            underline="hover"
            variant="body2"
            onClick={() => void openLink({ url: prUrl ?? "" })}
            sx={{ alignSelf: "flex-start" }}
          >
            {t("workspace.pr.viewDetails")}
          </Link>
        ) : null}
      </Stack>

      {prOpen ? (
        <Stack spacing={0.75}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <ButtonGroup variant="contained" size="small" sx={{ fontSize: 13 }}>
              <Button
                onClick={() => void actions.handleMerge()}
                disabled={!mergeEnabled || actions.isMerging}
                sx={{ fontSize: 13, px: 1.5, py: 0.25, lineHeight: 1.5 }}
              >
                {actions.isMerging ? t("workspace.pr.merging") : t(`workspace.pr.${mergeMethod}`)}
              </Button>
              <Button
                onClick={actions.handleOpenMergeMenu}
                disabled={!mergeEnabled || actions.isMerging}
                sx={{ minWidth: 24, px: 0.5, py: 0.25 }}
              >
                <LuChevronDown size={14} />
              </Button>
            </ButtonGroup>
            <Menu
              anchorEl={actions.mergeAnchorEl}
              open={actions.mergeMenuOpen}
              onClose={actions.handleCloseMergeMenu}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              transformOrigin={{ vertical: "top", horizontal: "left" }}
            >
              <MenuItem selected={mergeMethod === "merge"} onClick={() => handleSelectMergeMethod("merge")}>
                {t("workspace.pr.mergeCommit")}
              </MenuItem>
              <MenuItem selected={mergeMethod === "squash"} onClick={() => handleSelectMergeMethod("squash")}>
                {t("workspace.pr.squashMerge")}
              </MenuItem>
              <MenuItem selected={mergeMethod === "rebase"} onClick={() => handleSelectMergeMethod("rebase")}>
                {t("workspace.pr.rebaseMerge")}
              </MenuItem>
            </Menu>
            <Button
              size="small"
              onClick={() => void actions.handleClose()}
              disabled={actions.isClosing}
              sx={{ fontSize: 13, px: 1.5, py: 0.25, lineHeight: 1.5, minWidth: 0 }}
            >
              {actions.isClosing ? t("workspace.pr.closing") : t("workspace.pr.close")}
            </Button>
          </Stack>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={actions.deleteBranch}
                onChange={(_, checked) => actions.setDeleteBranch(checked)}
                disabled={!mergeEnabled || actions.isMerging}
                sx={{ py: 0 }}
              />
            }
            label={t("workspace.pr.deleteBranch")}
            sx={{ mx: 0, "& .MuiFormControlLabel-label": { fontSize: 12 } }}
          />
        </Stack>
      ) : null}

      {actionError ? (
        <Alert severity="error" variant="outlined" onClose={() => actions.setActionError(null)} sx={{ fontSize: 12 }}>
          {actionError}
        </Alert>
      ) : null}
    </>
  );
}
