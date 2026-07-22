import { Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LuCircleCheck, LuCircleX, LuClock, LuRefreshCw } from "react-icons/lu";
import { api } from "../../api";
import type { ScheduledJobRecord, ScheduledJobRunRecord } from "../../api/scheduledJobApi";
import { getErrorMessage } from "../../helpers/errorHelpers";

type ScheduledJobRunsSidebarProps = {
  orgId: string;
  job: ScheduledJobRecord;
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

/** Returns a short date (Mon DD) or empty string. */
function formatShortDate(isoDate: string | null): string {
  if (!isoDate) {
    return "";
  }
  return new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Returns a short time string (HH:MM) or a dash. */
function formatShortTime(isoDate: string | null): string {
  if (!isoDate) {
    return "—";
  }
  return new Date(isoDate).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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
export function ScheduledJobRunsSidebar({ orgId, job }: ScheduledJobRunsSidebarProps) {
  const { t } = useTranslation();

  const runsQuery = useQuery({
    queryKey: ["scheduled-job-runs", orgId, job.id],
    queryFn: () => api.scheduledJob.listRuns(orgId, job.id, 20),
    enabled: Boolean(orgId && job.id),
    refetchInterval: (query) => {
      const runs = query.state.data;
      if (!runs || runs.length === 0) {
        return false;
      }
      return runs.some((run) => run.status === "pending" || run.status === "running") ? 10_000 : false;
    },
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
        <Tooltip title={t("scheduledJob.runs.refresh")}>
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
