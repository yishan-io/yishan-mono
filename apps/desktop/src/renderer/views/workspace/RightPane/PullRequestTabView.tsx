import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Link,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowRight, LuCheck, LuChevronDown, LuCircleDashed, LuX } from "react-icons/lu";
import type { WorkspacePullRequestRecord } from "../../../api/types";
import { openLink } from "../../../commands/appCommands";
import { closePullRequest, mergePullRequest } from "../../../commands/gitCommands";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import { BranchBadge } from "../../../components/BranchBadge";
import { PaneLoadingBar } from "../../../components/PaneLoadingBar";
import { PullRequestIcon } from "../../../components/PullRequestIcon";
import { livePrStatus } from "../../../helpers/pullRequestUtils";
import type { DaemonWorkspacePullRequest, DaemonWorkspacePullRequestCheck } from "../../../rpc/daemonTypes";
import { workspaceStore } from "../../../store/workspaceStore";
import { useWorkspacePullRequestState } from "./useWorkspacePullRequestState";

type MergeMethod = "merge" | "squash" | "rebase";

function CheckStateIcon({ state }: { state: string }) {
  const s = state.toUpperCase();
  if (s === "SUCCESS") {
    return <LuCheck size={14} color="#16a34a" />;
  }
  if (s === "FAILURE" || s === "TIMED_OUT" || s === "CANCELLED" || s === "ACTION_REQUIRED") {
    return <LuX size={14} color="#dc2626" />;
  }
  return <LuCircleDashed size={14} color="#71717a" />;
}

function isFailingCheck(check: DaemonWorkspacePullRequestCheck): boolean {
  const s = check.state.toUpperCase();
  return s === "FAILURE" || s === "TIMED_OUT" || s === "CANCELLED" || s === "ACTION_REQUIRED";
}

function canMergePR(pr: DaemonWorkspacePullRequest): boolean {
  const status = livePrStatus(pr);
  if (status !== "open") return false;
  const checks = pr.checks ?? [];
  if (checks.length === 0) return true;
  return !checks.some(isFailingCheck);
}

function HistoricalPullRequestRow({ pr }: { pr: WorkspacePullRequestRecord }) {
  const { t } = useTranslation();
  const isDraft = (pr.metadata as Record<string, unknown> | null)?.isDraft as boolean | undefined;

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <PullRequestIcon state={pr.state} isDraft={isDraft} size={15} />
        <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
          #{pr.prId}
          {pr.title ? ` ${pr.title}` : ""}
        </Typography>
        <Chip size="small" label={pr.state} variant="outlined" sx={{ flexShrink: 0, fontSize: 11, height: 20 }} />
      </Stack>
      {pr.branch || pr.baseBranch ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, overflow: "hidden" }}>
          <BranchBadge name={pr.branch || t("workspace.info.unavailable")} />
          <Box sx={{ flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
            <LuArrowRight size={13} color="currentColor" />
          </Box>
          <BranchBadge name={pr.baseBranch || t("workspace.info.unavailable")} />
        </Box>
      ) : null}
      {pr.url ? (
        <Link
          component="button"
          type="button"
          underline="hover"
          variant="caption"
          onClick={() => void openLink({ url: pr.url ?? "" })}
          sx={{ alignSelf: "flex-start" }}
        >
          {t("workspace.pr.viewDetails")}
        </Link>
      ) : null}
    </Stack>
  );
}

/** Renders pull request, checks, and deployment details for the selected workspace. */
export function PullRequestTabView({ active = true }: { active?: boolean }) {
  const { t } = useTranslation();
  const { pullRequest, historicalPullRequests, isLoading } = useWorkspacePullRequestState(active);
  const worktreePath = workspaceStore((state) => state.workspaces.find((w) => w.id === state.selectedWorkspaceId)?.worktreePath);

  const hasLivePr = Boolean(pullRequest);
  const checks = pullRequest?.checks ?? [];
  const deployments = pullRequest?.deployments ?? [];
  const livePrId = pullRequest?.number != null ? String(pullRequest.number) : null;

  // If no live daemon PR, promote the latest open PR from history as the current PR.
  const bestOpenHistoryPr = !hasLivePr
    ? (historicalPullRequests ?? []).find((pr) => pr.state === "open")
    : undefined;

  const pastPullRequests = (historicalPullRequests ?? []).filter(
    (pr) => pr.prId !== livePrId && (!bestOpenHistoryPr || pr.id !== bestOpenHistoryPr.id),
  );
  const hasHistory = pastPullRequests.length > 0;
  const isEmpty = !hasLivePr && !bestOpenHistoryPr && !hasHistory;
  const prNumber = pullRequest?.number ?? (bestOpenHistoryPr ? Number(bestOpenHistoryPr.prId) : undefined);
  const prTitle = pullRequest?.title ?? bestOpenHistoryPr?.title ?? undefined;
  const prUrl = pullRequest?.url ?? bestOpenHistoryPr?.url ?? undefined;
  const prBranch = pullRequest?.branch ?? bestOpenHistoryPr?.branch ?? undefined;
  const prBaseBranch = pullRequest?.baseBranch ?? bestOpenHistoryPr?.baseBranch ?? undefined;
  const mergeEnabled = pullRequest ? canMergePR(pullRequest) : true;
  const prOpen = hasLivePr && pullRequest
    ? !pullRequest.complete && livePrStatus(pullRequest) !== "closed"
    : Boolean(bestOpenHistoryPr);

  const [mergeAnchorEl, setMergeAnchorEl] = useState<null | HTMLElement>(null);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>("merge");
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [isMerging, setIsMerging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const mergeMenuOpen = Boolean(mergeAnchorEl);

  const handleOpenMergeMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setMergeAnchorEl(event.currentTarget);
  }, []);

  const handleCloseMergeMenu = useCallback(() => {
    setMergeAnchorEl(null);
  }, []);

  const selectMergeMethod = useCallback((method: MergeMethod) => {
    setMergeMethod(method);
    setMergeAnchorEl(null);
  }, []);

  const handleMerge = useCallback(async () => {
    if (!prNumber || !worktreePath || isMerging) return;
    setIsMerging(true);
    setActionError(null);
    try {
      await mergePullRequest({
        workspaceWorktreePath: worktreePath,
        prNumber,
        method: mergeMethod,
        deleteBranch,
      });
      const state = workspaceStore.getState();
      if (hasLivePr && pullRequest) {
        state.setWorkspacePullRequest(state.selectedWorkspaceId, {
          ...pullRequest,
          complete: true,
          status: "merged",
        });
      } else {
        // No live daemon PR — synthesize a merged PR entry so the UI reflects the merge.
        state.setWorkspacePullRequest(state.selectedWorkspaceId, {
          number: prNumber,
          title: prTitle ?? "",
          url: prUrl ?? "",
          branch: prBranch ?? "",
          baseBranch: prBaseBranch ?? "",
          complete: true,
          status: "merged",
        } as DaemonWorkspacePullRequest);
      }
    } catch (error: unknown) {
      console.error("[PullRequestTabView] merge failed", error);
      setActionError(getErrorMessage(error));
    } finally {
      setIsMerging(false);
    }
  }, [prNumber, worktreePath, mergeMethod, deleteBranch, isMerging, hasLivePr, pullRequest, prTitle, prUrl, prBranch, prBaseBranch]);

  const handleClose = useCallback(async () => {
    if (!prNumber || !worktreePath || isClosing) return;
    setIsClosing(true);
    setActionError(null);
    try {
      await closePullRequest({
        workspaceWorktreePath: worktreePath,
        prNumber,
      });
      const state = workspaceStore.getState();
      if (hasLivePr && pullRequest) {
        state.setWorkspacePullRequest(state.selectedWorkspaceId, {
          ...pullRequest,
          status: "closed",
          githubState: "CLOSED",
        });
      } else {
        state.setWorkspacePullRequest(state.selectedWorkspaceId, {
          number: prNumber,
          title: prTitle ?? "",
          url: prUrl ?? "",
          branch: prBranch ?? "",
          baseBranch: prBaseBranch ?? "",
          complete: true,
          status: "closed",
          githubState: "CLOSED",
        } as DaemonWorkspacePullRequest);
      }
    } catch (error: unknown) {
      console.error("[PullRequestTabView] close failed", error);
      setActionError(getErrorMessage(error));
    } finally {
      setIsClosing(false);
    }
  }, [prNumber, worktreePath, isClosing, hasLivePr, pullRequest, prTitle, prUrl, prBranch, prBaseBranch]);

  if (isLoading && isEmpty) {
    return <PaneLoadingBar />;
  }

  if (isEmpty) {
    return (
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", px: 3 }}>
        <Typography variant="body2" sx={{ color: "#999" }}>
          {t("workspace.pr.empty")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", px: 2, py: 1.5 }}>
      <Stack spacing={2}>
        {/* ── Live PR (from daemon) ── */}
        {pullRequest || bestOpenHistoryPr ? (
          <>
            <Stack spacing={0.75}>
              <Stack direction="row" spacing={1} alignItems="center">
                <PullRequestIcon state={hasLivePr && pullRequest ? livePrStatus(pullRequest) : "open"} size={18} />
                <Typography variant="subtitle1" noWrap>
                  #{prNumber}
                  {prTitle ? ` ${prTitle}` : ""}
                </Typography>
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

            {checks.length > 0 ? (
              <Stack spacing={1}>
                <Typography variant="subtitle2">{t("workspace.pr.checks")}</Typography>
                {checks.map((check) => (
                  <Stack key={`${check.workflow ?? ""}:${check.name}`} direction="row" spacing={1} alignItems="center">
                    <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                      <CheckStateIcon state={check.state} />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      {check.url ? (
                        <Link
                          component="button"
                          type="button"
                          underline="hover"
                          variant="body2"
                          onClick={() => void openLink({ url: check.url ?? "" })}
                          sx={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            color: "text.primary",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {check.workflow ? `${check.workflow} / ${check.name}` : check.name}
                        </Link>
                      ) : (
                        <Typography variant="body2" noWrap>
                          {check.workflow ? `${check.workflow} / ${check.name}` : check.name}
                        </Typography>
                      )}
                      {check.description ? (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {check.description}
                        </Typography>
                      ) : null}
                    </Box>
                  </Stack>
                ))}
              </Stack>
            ) : null}

            {deployments.length > 0 ? (
              <>
                <Divider />
                <Stack spacing={1}>
                  <Typography variant="subtitle2">{t("workspace.pr.deployments")}</Typography>
                  {deployments.map((deployment) => (
                    <Stack key={deployment.id} direction="row" spacing={1} alignItems="center">
                      <Chip
                        size="small"
                        label={deployment.state || t("workspace.info.unavailable")}
                        variant="outlined"
                      />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" noWrap>
                          {deployment.environment || t("workspace.info.unavailable")}
                        </Typography>
                        {deployment.description ? (
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {deployment.description}
                          </Typography>
                        ) : null}
                      </Box>
                      {deployment.environmentUrl ? (
                        <Link
                          component="button"
                          type="button"
                          underline="hover"
                          variant="caption"
                          onClick={() => void openLink({ url: deployment.environmentUrl ?? "" })}
                          sx={{ flexShrink: 0 }}
                        >
                          {t("workspace.pr.open")}
                        </Link>
                      ) : null}
                    </Stack>
                  ))}
                </Stack>
              </>
            ) : null}

            {/* ── Merge / Close actions ── */}
            {prOpen ? (
              <Stack spacing={0.75}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <ButtonGroup variant="contained" size="small" sx={{ fontSize: 13 }}>
                    <Button
                      onClick={handleMerge}
                      disabled={!mergeEnabled || isMerging}
                      sx={{ textTransform: "none", fontSize: 13, px: 1.5, py: 0.25, lineHeight: 1.5 }}
                    >
                      {isMerging ? t("workspace.pr.merging") : t(`workspace.pr.${mergeMethod}`)}
                    </Button>
                    <Button
                      onClick={handleOpenMergeMenu}
                      disabled={!mergeEnabled || isMerging}
                      sx={{ minWidth: 24, px: 0.5, py: 0.25 }}
                    >
                      <LuChevronDown size={14} />
                    </Button>
                  </ButtonGroup>
                  <Menu
                    anchorEl={mergeAnchorEl}
                    open={mergeMenuOpen}
                    onClose={handleCloseMergeMenu}
                    anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                    transformOrigin={{ vertical: "top", horizontal: "left" }}
                  >
                    <MenuItem
                      selected={mergeMethod === "merge"}
                      onClick={() => selectMergeMethod("merge")}
                      dense
                    >
                      {t("workspace.pr.mergeCommit")}
                    </MenuItem>
                    <MenuItem
                      selected={mergeMethod === "squash"}
                      onClick={() => selectMergeMethod("squash")}
                      dense
                    >
                      {t("workspace.pr.squashMerge")}
                    </MenuItem>
                    <MenuItem
                      selected={mergeMethod === "rebase"}
                      onClick={() => selectMergeMethod("rebase")}
                      dense
                    >
                      {t("workspace.pr.rebaseMerge")}
                    </MenuItem>
                  </Menu>
                  <Button
                    size="small"
                    onClick={handleClose}
                    disabled={isClosing}
                    sx={{ textTransform: "none", fontSize: 13, px: 1.5, py: 0.25, lineHeight: 1.5, minWidth: 0 }}
                  >
                    {isClosing ? t("workspace.pr.closing") : t("workspace.pr.close")}
                  </Button>
                </Stack>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={deleteBranch}
                      onChange={(_, checked) => setDeleteBranch(checked)}
                      disabled={!mergeEnabled || isMerging}
                      sx={{ py: 0 }}
                />
                }
                  label={t("workspace.pr.deleteBranch")}
                  sx={{ mx: 0, "& .MuiFormControlLabel-label": { fontSize: 12 } }}
                />
              </Stack>
            ) : null}

            {actionError ? (
              <Alert severity="error" variant="outlined" onClose={() => setActionError(null)} sx={{ fontSize: 12 }}>
                {actionError}
              </Alert>
            ) : null}
          </>
        ) : null}

        {/* ── Historical PRs (from api-service) ── */}
        {hasHistory ? (
          <>
            {(pullRequest || bestOpenHistoryPr) ? <Divider /> : null}
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
                {t("workspace.pr.history")}
              </Typography>
            </Stack>
            <Stack spacing={1.5} divider={<Divider />}>
              {pastPullRequests.map((pr) => (
                <HistoricalPullRequestRow key={pr.id} pr={pr} />
              ))}
            </Stack>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}
