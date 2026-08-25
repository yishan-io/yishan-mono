import { Box } from "@mui/material";
import type { LocalTaskPriority } from "../localTaskTypes";

const ACTIVE_BAR_COUNT_BY_PRIORITY = {
  low: 1,
  medium: 2,
  high: 3,
} as const;

const BAR_HEIGHTS = [5, 9, 13] as const;

type LocalTaskPriorityIconProps = {
  priority: LocalTaskPriority;
  size?: number;
  "aria-label"?: string;
};

/** Renders three signal bars with black active bars and grey inactive bars. */
export function LocalTaskPriorityIcon({ priority, size = 15, "aria-label": ariaLabel }: LocalTaskPriorityIconProps) {
  const activeBarCount = ACTIVE_BAR_COUNT_BY_PRIORITY[priority];
  const scale = size / 15;

  return (
    <Box
      component="span"
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      data-testid="local-task-priority-icon"
      data-priority={priority}
      sx={{ display: "inline-flex", alignItems: "flex-end", gap: 0.25, height: size, flexShrink: 0 }}
    >
      {BAR_HEIGHTS.map((height, index) => (
        <Box
          component="span"
          data-active={index < activeBarCount}
          data-testid={`local-task-priority-bar-${index + 1}`}
          key={height}
          sx={{
            width: 2,
            height: height * scale,
            borderRadius: 0.25,
            bgcolor: index < activeBarCount ? "text.primary" : "text.disabled",
          }}
        />
      ))}
    </Box>
  );
}
