import { Box, Tooltip } from "@mui/material";
import { LuCircleCheck, LuCirclePause, LuLink2Off } from "react-icons/lu";
import { RiProgress4Line } from "react-icons/ri";
import type { LocalTaskStatus } from "../localTaskTypes";

const STATUS_ICONS = {
  active: RiProgress4Line,
  paused: LuCirclePause,
  completed: LuCircleCheck,
  unlinked: LuLink2Off,
} as const;

const STATUS_COLORS = {
  active: "warning.light",
  paused: "text.secondary",
  completed: "success.main",
  unlinked: "text.disabled",
} as const;

/** Status meanings shown by a Local Task or its workspace relationship. */
export type LocalTaskStatusIconStatus = LocalTaskStatus | "unlinked";

type LocalTaskStatusIconProps = {
  status: LocalTaskStatusIconStatus;
  label?: string;
  size?: number;
};

/** Renders an accessible, tooltip-labelled icon for a Local Task status. */
export function LocalTaskStatusIcon({ status, label, size = 15 }: LocalTaskStatusIconProps) {
  const StatusIcon = STATUS_ICONS[status];

  const icon = (
    <Box
      component="span"
      role={label ? "img" : undefined}
      aria-label={label}
      sx={{ display: "inline-flex", flexShrink: 0, color: STATUS_COLORS[status] }}
    >
      <StatusIcon aria-hidden={Boolean(label)} data-testid="local-task-status-icon" size={size} />
    </Box>
  );

  return label ? <Tooltip title={label}>{icon}</Tooltip> : icon;
}
