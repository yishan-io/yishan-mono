import { Box, Button, CircularProgress, Divider, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LuArrowLeft,
  LuCircleCheck,
  LuCircleX,
  LuClock,
  LuPause,
  LuPencil,
  LuPlay,
  LuRefreshCw,
  LuTrash2,
  LuZap,
} from "react-icons/lu";
import { api } from "../../api";
import type { ScheduledJobRecord, ScheduledJobRunRecord } from "../../api/scheduledJobApi";
import { AgentIcon } from "../../components/AgentIcon";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { PaneHeader } from "../../components/PaneHeader";
import { SplitPaneLayout } from "../../components/SplitPaneLayout";
import { renderProjectIcon } from "../../components/projectIcons";
import { isDesktopAgentKind } from "../../helpers/agentSettings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { getRendererPlatform } from "../../helpers/platform";
import { useCommands } from "../../hooks/useCommands";
import { useWorkspacePaneVisibilityContext } from "../../hooks/useWorkspacePaneVisibility";
import { scheduledJobStore } from "../../store/scheduledJobStore";
import { sessionStore } from "../../store/sessionStore";
import { workspaceStore } from "../../store/workspaceStore";
import { EditScheduledJobDialogView } from "./EditScheduledJobDialogView";

const RUNS_PANE_MIN_WIDTH = 160;
const RUNS_PANE_DEFAULT_WIDTH = 220;

type ScheduledJobDetailViewProps = {
  job: ScheduledJobRecord;
  onBack: () => void;
};

/** Returns a formatted date string or a dash when the value is absent. */
function formatOptionalDate(isoDate: string | null): string {
  if (!isoDate) {
    return "—";
  }
  return new Date(isoDate).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Returns a short time string (HH:MM) or a dash. */
function formatShortTime(isoDate: string | null): string {
  if (!isoDate) return "—";
  return new Date(isoDate).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function describeCronExpression(cronExpression: string): string {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return "Custom schedule";
  }

  const minute = parts[0] ?? "*";
  const hour = parts[1] ?? "*";
  const dayOfMonth = parts[2] ?? "*";
  const month = parts[3] ?? "*";
  const dayOfWeek = parts[4] ?? "*";
  const minuteText = String(minute).padStart(2, "0");
  const hourText = String(hour).padStart(2, "0");

  if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every hour";
  }
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") {
    return `Weekdays at ${hourText}:${minuteText}`;
  }
  if (dayOfMonth === "*" && month === "*" && /^\d$/.test(dayOfWeek)) {
    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weekdayName = weekdayNames[Number.parseInt(dayOfWeek, 10)] ?? `day ${dayOfWeek}`;
    return `Weekly on ${weekdayName} at ${hourText}:${minuteText}`;
  }
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Daily at ${hourText}:${minuteText}`;
  }

  return "Custom schedule";
}

/** Returns a short date (Mon DD) or empty string. */
function formatShortDate(isoDate: string | null): string {
  if (!isoDate) return "";
  return new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type FieldRowProps = { label: string; children: React.ReactNode };

/** Renders one labelled field row in the detail view. */
function FieldRow({ label, children }: FieldRowProps) {
  return (
    <Box sx={{ display: "flex", gap: 2, py: 1, alignItems: "flex-start" }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, flexShrink: 0, pt: 0.1 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

type RunStatusConfig = { dotColor: string; icon: React.ReactNode | null };

/** Returns colour and icon for one run status. */
function useRunStatusConfig(status: ScheduledJobRunRecord["status"]): RunStatusConfig {
  switch (status) {
    case "succeeded":
      return { dotColor: "success.main", icon: <LuCircleCheck size={13} /> };
    case "failed":
      return { dotColor: "error.main", icon: <LuCircleX size={13} /> };
    case "running":
      return { dotColor: "warning.main", icon: <LuRefreshCw size={13} /> };
    case "pending":
      return { dotColor: "text.disabled", icon: <LuClock size={13} /> };
    case "skipped_offline":
      return { dotColor: "text.disabled", icon: <LuClock size={13} /> };
    default:
      return { dotColor: "text.disabled", icon: null };
  }
}

/** Renders one run entry in the runs sidebar. */
function RunSidebarItem({ run }: { run: ScheduledJobRunRecord }) {
  const { t } = useTranslation();
  const config = useRunStatusConfig(run.status);

  return (
    <Box
      sx={{
        px: 1.5,
        py: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}>
        <Box component="span" sx={{ display: "inline-flex", color: config.dotColor, flexShrink: 0 }}>
          {config.icon}
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {t(`scheduledJob.runs.status.${run.status}`)}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {formatShortDate(run.scheduledFor)} {formatShortTime(run.scheduledFor)}
      </Typography>
      {run.finishedAt && run.startedAt ? (
        <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>
          {Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
        </Typography>
      ) : null}
      {run.errorMessage ? (
        <Typography
          variant="caption"
          color="error"
          sx={{ display: "block", mt: 0.25, wordBreak: "break-word", whiteSpace: "pre-wrap" }}
        >
          {run.errorMessage}
        </Typography>
      ) : null}
    </Box>
  );
}

/** Renders the runs history sidebar. */
function RunsSidebar({ orgId, jobId, job }: { orgId: string; jobId: string; job: ScheduledJobRecord }) {
  const { t } = useTranslation();

  const runsQuery = useQuery({
    queryKey: ["scheduled-job-runs", orgId, jobId],
    queryFn: () => api.scheduledJob.listRuns(orgId, jobId, 20),
    enabled: Boolean(orgId && jobId),
  });

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t("scheduledJob.runs.title")}
        </Typography>
        <Tooltip title={t("scheduledJob.runs.refresh")} arrow>
          <IconButton
            size="small"
            onClick={() => runsQuery.refetch()}
            disabled={runsQuery.isFetching}
            aria-label={t("scheduledJob.runs.refresh")}
          >
            <LuRefreshCw size={13} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto" }}>
        {/* Next run entry */}
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>
            {t("scheduledJob.runs.nextRun")}
          </Typography>
          <Typography variant="body2">{job.status === "active" ? formatOptionalDate(job.nextRunAt) : "—"}</Typography>
        </Box>
        {runsQuery.isLoading ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 4 }}>
            <CircularProgress size={20} />
          </Box>
        ) : runsQuery.isError ? (
          <Box sx={{ p: 1.5 }}>
            <Typography variant="caption" color="error">
              {getErrorMessage(runsQuery.error)}
            </Typography>
          </Box>
        ) : runsQuery.data?.length === 0 ? (
          <Box sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              {t("scheduledJob.runs.empty")}
            </Typography>
          </Box>
        ) : (
          runsQuery.data?.map((run) => <RunSidebarItem key={run.id} run={run} />)
        )}
      </Box>
    </Box>
  );
}

/** Renders the detail view for one scheduled job with a runs history sidebar. */
export function ScheduledJobDetailView({ job, onBack }: ScheduledJobDetailViewProps) {
  const { t } = useTranslation();
  const { leftCollapsed } = useWorkspacePaneVisibilityContext();
  const shouldReserveMacInset = getRendererPlatform() === "darwin" && leftCollapsed;
  const isPending = scheduledJobStore((state) => state.pendingActionIds.includes(job.id));
  const orgId = sessionStore((state) => state.selectedOrganizationId ?? "");
  const project = workspaceStore((state) => state.projects.find((p) => p.id === job.projectId));
  const { pauseScheduledJob, resumeScheduledJob, runScheduledJobNow, deleteScheduledJob } = useCommands();
  const [runsPaneWidth, setRunsPaneWidth] = useState(RUNS_PANE_DEFAULT_WIDTH);
  const dragRef = useRef({ startX: 0, startWidth: 0 });
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleResizeStart = useCallback(
    (clientX: number) => {
      dragRef.current = { startX: clientX, startWidth: runsPaneWidth };
    },
    [runsPaneWidth],
  );

  const handleResizeMove = useCallback((clientX: number) => {
    const delta = dragRef.current.startX - clientX;
    setRunsPaneWidth(Math.max(RUNS_PANE_MIN_WIDTH, dragRef.current.startWidth + delta));
  }, []);

  const handlePause = useCallback(() => {
    void pauseScheduledJob(job.id);
  }, [pauseScheduledJob, job.id]);

  const handleResume = useCallback(() => {
    void resumeScheduledJob(job.id);
  }, [resumeScheduledJob, job.id]);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteScheduledJob(job.id);
      onBack();
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  }, [deleteScheduledJob, job.id, onBack]);

  const primaryAction = job.status === "active" ? "pause" : job.status === "paused" ? "resume" : null;
  const canRunNow = !isPending;

  const statusDotColor = job.status === "active" ? "success.main" : "text.disabled";

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <PaneHeader justifyContent="space-between" showMacInset={shouldReserveMacInset}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0, flex: 1 }}>
          <Box className="electron-webkit-app-region-no-drag" sx={{ display: "inline-flex" }}>
            <IconButton size="small" onClick={onBack} aria-label={t("scheduledJob.detail.back")}>
              <LuArrowLeft size={16} />
            </IconButton>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {job.name}
          </Typography>
        </Box>
        <Box className="electron-webkit-app-region-no-drag" sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          {primaryAction ? (
            <Tooltip title={t(`scheduledJob.actions.${primaryAction}`)} arrow>
              <Box className="electron-webkit-app-region-no-drag" sx={{ display: "inline-flex" }}>
                <Button
                  size="small"
                  variant="text"
                  startIcon={primaryAction === "pause" ? <LuPause size={13} /> : <LuPlay size={13} />}
                  onClick={primaryAction === "pause" ? handlePause : handleResume}
                  disabled={isPending}
                  sx={{ textTransform: "none", color: "text.secondary", minWidth: 92 }}
                >
                  {t(`scheduledJob.actions.${primaryAction}`)}
                </Button>
              </Box>
            </Tooltip>
          ) : null}
          {
            <Tooltip title={t("scheduledJob.actions.runNow")} arrow>
              <Button
                size="small"
                variant="text"
                startIcon={<LuZap size={13} />}
                onClick={() => void runScheduledJobNow(job.id)}
                disabled={!canRunNow}
                sx={{ textTransform: "none", color: "text.secondary", px: 1.5 }}
              >
                {t("scheduledJob.actions.runNow")}
              </Button>
            </Tooltip>
          }
          <Tooltip title={t("scheduledJob.actions.edit")} arrow>
            <Button
              size="small"
              variant="text"
              startIcon={<LuPencil size={13} />}
              onClick={() => setIsEditOpen(true)}
              sx={{ textTransform: "none", color: "text.secondary" }}
            >
              {t("scheduledJob.actions.edit")}
            </Button>
          </Tooltip>
          <Tooltip title={t("scheduledJob.actions.delete")} arrow>
            <IconButton
              size="small"
              onClick={() => setIsDeleteOpen(true)}
              aria-label={t("scheduledJob.actions.delete")}
              sx={{
                color: "text.secondary",
                ":hover": {
                  color: "error.main",
                },
              }}
            >
              <LuTrash2 size={15} />
            </IconButton>
          </Tooltip>
        </Box>
      </PaneHeader>

      {/* Two-column body via SplitPaneLayout */}
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <SplitPaneLayout
          position="right"
          collapsed={false}
          resizeLabel={t("scheduledJob.runs.resizeLabel")}
          onResizeStart={handleResizeStart}
          onResizeMove={handleResizeMove}
          sideContent={
            <Box sx={{ width: runsPaneWidth, minWidth: runsPaneWidth, height: "100%" }}>
              <RunsSidebar orgId={orgId} jobId={job.id} job={job} />
            </Box>
          }
        >
          {/* Left: fields */}
          <Box sx={{ height: "100%", overflow: "auto", px: 2.5, py: 1.5 }}>
            <Stack divider={<Divider sx={{ borderStyle: "dashed" }} />}>
              <FieldRow label={t("scheduledJob.detail.fields.name")}>
                <Typography variant="body2">{job.name}</Typography>
              </FieldRow>

              <FieldRow label={t("scheduledJob.detail.fields.status")}>
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: statusDotColor, flexShrink: 0 }} />
                  <Typography variant="body2">{t(`scheduledJob.status.${job.status}`)}</Typography>
                </Box>
              </FieldRow>

              <FieldRow label={t("scheduledJob.detail.fields.project")}>
                {project ? (
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 16,
                        height: 16,
                        borderRadius: 0.5,
                        bgcolor: project.color ?? "primary.main",
                        color: "common.white",
                        fontSize: 10,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {renderProjectIcon(project.icon ?? undefined, 10)}
                    </Box>
                    <Typography variant="body2">{project.name}</Typography>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.disabled">
                    —
                  </Typography>
                )}
              </FieldRow>

              <FieldRow label={t("scheduledJob.detail.fields.cronExpression")}>
                <Box>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {job.cronExpression}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {describeCronExpression(job.cronExpression)}
                  </Typography>
                </Box>
              </FieldRow>

              <FieldRow label={t("scheduledJob.detail.fields.timezone")}>
                <Typography variant="body2">{job.timezone}</Typography>
              </FieldRow>

              <FieldRow label={t("scheduledJob.detail.fields.agentKind")}>
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                  {isDesktopAgentKind(job.agentKind) ? (
                    <AgentIcon agentKind={job.agentKind} context="settingsRow" decorative />
                  ) : null}
                  <Typography variant="body2">{job.agentKind}</Typography>
                </Box>
              </FieldRow>

              {job.model ? (
                <FieldRow label={t("scheduledJob.detail.fields.model")}>
                  <Typography variant="body2">{job.model}</Typography>
                </FieldRow>
              ) : null}

              {job.command ? (
                <FieldRow label={t("scheduledJob.detail.fields.command")}>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {job.command}
                  </Typography>
                </FieldRow>
              ) : null}

              <FieldRow label={t("scheduledJob.detail.fields.createdAt")}>
                <Typography variant="body2" color="text.secondary">
                  {formatOptionalDate(job.createdAt)}
                </Typography>
              </FieldRow>

              <FieldRow label={t("scheduledJob.detail.fields.updatedAt")}>
                <Typography variant="body2" color="text.secondary">
                  {formatOptionalDate(job.updatedAt)}
                </Typography>
              </FieldRow>

              <FieldRow label={t("scheduledJob.detail.fields.prompt")}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {job.prompt}
                </Typography>
              </FieldRow>
            </Stack>
          </Box>
        </SplitPaneLayout>
      </Box>

      <EditScheduledJobDialogView job={job} open={isEditOpen} onClose={() => setIsEditOpen(false)} />

      <ConfirmationDialog
        open={isDeleteOpen}
        title={t("scheduledJob.delete.title")}
        description={t("scheduledJob.delete.description", { name: job.name })}
        confirmLabel={t("scheduledJob.delete.confirm")}
        cancelLabel={t("common.actions.cancel")}
        confirmColor="error"
        isSubmitting={isDeleting}
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </Box>
  );
}
