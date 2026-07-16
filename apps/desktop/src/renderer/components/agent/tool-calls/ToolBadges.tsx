import { Box, Typography } from "@mui/material";
import type { DiffStats } from "./helpers";

/** Compact diff-stat badge used by edit and write tools. */
export function ToolDiffStats({ stats, highlight }: { stats: DiffStats; highlight: boolean }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
      <Typography
        variant="body2"
        component="span"
        sx={{
          fontFamily: "monospace",
          fontSize: "0.75rem",
          color: highlight ? "success.main" : "text.primary",
        }}
      >
        +{stats.added}
      </Typography>
      <Typography
        variant="body2"
        component="span"
        sx={{
          fontFamily: "monospace",
          fontSize: "0.75rem",
          color: highlight ? "error.main" : "text.primary",
        }}
      >
        -{stats.removed}
      </Typography>
    </Box>
  );
}

/** Compact line-range badge used by read tools. */
export function ToolLineRange({ lineRange }: { lineRange: string }) {
  return (
    <Typography
      variant="body2"
      component="span"
      data-testid="read-tool-line-range"
      sx={{
        fontFamily: "monospace",
        fontSize: "0.75rem",
        color: "info.main",
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {lineRange}
    </Typography>
  );
}

/** Compact summary badge used by memory and agent tool summaries. */
export function ToolSummaryBadge({ label, color }: { label: string; color: string }) {
  return (
    <Typography
      variant="body2"
      component="span"
      sx={{
        fontFamily: "monospace",
        fontSize: "0.75rem",
        color,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {label}
    </Typography>
  );
}
