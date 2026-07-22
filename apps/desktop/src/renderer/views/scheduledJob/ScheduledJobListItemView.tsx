import { Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LuPause, LuPlay } from "react-icons/lu";
import type { ScheduledJobRecord } from "../../api/scheduledJobApi";
import { AgentIcon } from "../../components/AgentIcon";
import { renderProjectIcon } from "../../components/projectIcons";
import { isDesktopAgentKind } from "../../helpers/agentSettings";
import { useCommands } from "../../hooks/useCommands";
import { scheduledJobStore } from "../../store/scheduledJobStore";
import { workspaceStore } from "../../store/workspaceStore";
import { ScheduledJobRunStatusIcon } from "./ScheduledJobRunStatusIcon";
import { ScheduledJobStatusIndicator } from "./ScheduledJobStatusIndicator";

type ScheduledJobListItemViewProps = {
  job: ScheduledJobRecord;
  onOpenDetails?: (jobId: string) => void;
};

/** Returns a formatted date string or a dash when the value is absent. */
function formatOptionalDate(isoDate: string | null): string {
  if (!isoDate) {
    return "—";
  }
  return new Date(isoDate).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const tdSx = {
  px: 1.5,
  py: 1,
  verticalAlign: "middle",
  borderBottom: "1px solid",
  borderColor: "divider",
  whiteSpace: "nowrap" as const,
} as const;

/** Renders one scheduled job row as a <tr> inside the jobs table. */
export function ScheduledJobListItemView({ job, onOpenDetails }: ScheduledJobListItemViewProps) {
  const { t } = useTranslation();
  const isPending = scheduledJobStore((state) => state.pendingActionIds.includes(job.id));
  const project = workspaceStore((state) => state.projects.find((p) => p.id === job.projectId));
  const { pauseScheduledJob, resumeScheduledJob } = useCommands();

  const handlePause = useCallback(() => {
    void pauseScheduledJob(job.id);
  }, [pauseScheduledJob, job.id]);

  const handleResume = useCallback(() => {
    void resumeScheduledJob(job.id);
  }, [resumeScheduledJob, job.id]);

  const handleOpenDetails = useCallback(() => {
    onOpenDetails?.(job.id);
  }, [onOpenDetails, job.id]);

  const canPause = job.status === "active" && !isPending;
  const canResume = job.status === "paused" && !isPending;

  return (
    <Box
      component="tr"
      sx={{
        bgcolor: "background.paper",
        "&:hover": { bgcolor: "action.hover" },
        cursor: onOpenDetails ? "pointer" : "default",
      }}
      onClick={onOpenDetails ? handleOpenDetails : undefined}
    >
      {/* Name */}
      <Box component="td" sx={tdSx}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {job.name}
        </Typography>
      </Box>

      {/* Project */}
      <Box component="td" sx={tdSx}>
        {project ? (
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
            <Box
              component="span"
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
            <Typography variant="body2" color="text.secondary">
              {project.name}
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.disabled">
            —
          </Typography>
        )}
      </Box>

      {/* Schedule */}
      <Box component="td" sx={tdSx}>
        <Typography variant="body2" color="text.secondary">
          {job.cronExpression}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          {job.timezone}
        </Typography>
      </Box>

      {/* Agent */}
      <Box component="td" sx={tdSx}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
          {isDesktopAgentKind(job.agentKind) ? (
            <AgentIcon agentKind={job.agentKind} context="settingsRow" decorative />
          ) : null}
          <Typography variant="body2" color="text.secondary">
            {job.agentKind}
          </Typography>
        </Box>
      </Box>

      {/* Status */}
      <Box component="td" sx={tdSx}>
        <ScheduledJobStatusIndicator status={job.status} variant="compact" />
      </Box>

      {/* Last run */}
      <Box component="td" sx={tdSx}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
          {job.lastRunStatus ? (
            <Tooltip title={t(`scheduledJob.lastRun.${job.lastRunStatus}`)}>
              <Box component="span">
                <ScheduledJobRunStatusIcon status={job.lastRunStatus} size={14} />
              </Box>
            </Tooltip>
          ) : null}
          <Typography variant="body2" color="text.secondary">
            {formatOptionalDate(job.lastRunAt)}
          </Typography>
        </Box>
      </Box>

      {/* Next run */}
      <Box component="td" sx={tdSx}>
        <Typography variant="body2" color="text.secondary">
          {job.status === "active" ? formatOptionalDate(job.nextRunAt) : "—"}
        </Typography>
      </Box>

      {/* Actions — stop click propagation so row click doesn't fire */}
      <Box component="td" sx={{ ...tdSx, px: 0.5 }} onClick={(e) => e.stopPropagation()}>
        {isPending ? (
          <Box sx={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <CircularProgress size={14} />
          </Box>
        ) : (
          <>
            {canPause ? (
              <Tooltip title={t("scheduledJob.actions.pause")}>
                <IconButton onClick={handlePause} aria-label={t("scheduledJob.actions.pause")}>
                  <LuPause size={14} />
                </IconButton>
              </Tooltip>
            ) : null}
            {canResume ? (
              <Tooltip title={t("scheduledJob.actions.resume")}>
                <IconButton onClick={handleResume} aria-label={t("scheduledJob.actions.resume")}>
                  <LuPlay size={14} />
                </IconButton>
              </Tooltip>
            ) : null}
          </>
        )}
      </Box>
    </Box>
  );
}
