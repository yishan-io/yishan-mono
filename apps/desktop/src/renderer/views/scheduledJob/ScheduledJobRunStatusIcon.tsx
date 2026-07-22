import { Box } from "@mui/material";
import type { IconType } from "react-icons";
import { LuCircleCheck, LuCircleX, LuClock, LuRefreshCw } from "react-icons/lu";
import type { ScheduledJobLastRunStatus, ScheduledJobRunStatus } from "../../api/scheduledJobApi";

type ScheduledJobRunStatusIconProps = {
  /** The run status to present, or null when the job has not run yet. */
  status: ScheduledJobRunStatus | ScheduledJobLastRunStatus;
  /** The icon size in pixels, selected by the calling view. */
  size: number;
};

type RunStatusIconConfig = {
  color: string;
  Icon: IconType;
};

const ICON_CONFIG_BY_RUN_STATUS: Record<ScheduledJobRunStatus, RunStatusIconConfig> = {
  succeeded: { color: "success.main", Icon: LuCircleCheck },
  failed: { color: "error.main", Icon: LuCircleX },
  running: { color: "warning.main", Icon: LuRefreshCw },
  pending: { color: "text.disabled", Icon: LuClock },
  skipped_offline: { color: "text.disabled", Icon: LuClock },
};

/** Renders a colored icon for a scheduled-job run without labels or tooltip behavior. */
export function ScheduledJobRunStatusIcon({ status, size }: ScheduledJobRunStatusIconProps) {
  if (status === null) {
    return null;
  }

  const { color, Icon } = ICON_CONFIG_BY_RUN_STATUS[status];

  return (
    <Box
      component="span"
      data-testid="scheduled-job-run-status-icon"
      sx={{ display: "inline-flex", color, flexShrink: 0 }}
    >
      <Icon size={size} />
    </Box>
  );
}
