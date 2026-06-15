import { Box, Typography } from "@mui/material";

export type StatusIndicatorColor = "success" | "error" | "warning" | "info" | "disabled";

export type StatusIndicatorProps = {
  /** The status label text displayed beside the dot. */
  label: string;
  /** The color variant for the status dot. */
  color: StatusIndicatorColor;
  /** Override the dot size in pixels. Defaults to 8. */
  dotSize?: number;
};

const STATUS_COLOR_MAP: Record<StatusIndicatorColor, string> = {
  success: "success.main",
  error: "error.main",
  warning: "warning.main",
  info: "info.main",
  disabled: "text.disabled",
};

/**
 * Renders a small colored status dot with an accompanying text label.
 *
 * Use this for terminal session statuses, daemon connection states, or any
 * binary/multi-state inline indicator where a colored dot + label pattern is needed.
 *
 * @example
 * ```tsx
 * <StatusIndicator
 *   label={isRunning ? "Running" : "Exited"}
 *   color={isRunning ? "success" : "disabled"}
 * />
 * ```
 */
export function StatusIndicator({ label, color, dotSize = 8 }: StatusIndicatorProps) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
      <Box
        component="span"
        sx={{
          width: dotSize,
          height: dotSize,
          borderRadius: "50%",
          bgcolor: STATUS_COLOR_MAP[color],
          flexShrink: 0,
        }}
      />
      <Typography variant="body2" color={color === "disabled" ? "text.secondary" : "text.primary"}>
        {label}
      </Typography>
    </Box>
  );
}
