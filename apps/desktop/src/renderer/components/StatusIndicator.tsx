import { Box, Typography, type TypographyProps } from "@mui/material";

export type StatusIndicatorColor = "success" | "error" | "warning" | "info" | "disabled";

export type StatusIndicatorProps = {
  /** The status label text displayed beside the dot. */
  label: string;
  /** The color variant for the status dot. */
  color: StatusIndicatorColor;
  /** Override the dot size in pixels. Defaults to 8. */
  dotSize?: number;
  /** Override the space between the dot and label using theme spacing. Defaults to 0.75. */
  gap?: number;
  /** Override the label color. Defaults to secondary for disabled and primary for other statuses. */
  labelColor?: TypographyProps["color"];
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
export function StatusIndicator({
  label,
  color,
  dotSize = 8,
  gap = 0.75,
  labelColor = color === "disabled" ? "text.secondary" : "text.primary",
}: StatusIndicatorProps) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap }}>
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
      <Typography variant="body2" color={labelColor}>
        {label}
      </Typography>
    </Box>
  );
}
