import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

/** Compact file/path summary row shared by path-oriented tools. */
export function ToolPathSummary({
  icon,
  path,
  suffix = null,
  inlineSuffix = false,
  wrap = true,
}: {
  icon: ReactNode;
  path: string;
  suffix?: ReactNode;
  inlineSuffix?: boolean;
  /** When false the summary stays on one line with an ellipsis (e.g. collapsed bash commands). */
  wrap?: boolean;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, minWidth: 0, flex: 1 }}>
      <Box
        component="span"
        aria-hidden
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          opacity: 0.8,
          mt: "1px",
        }}
      >
        {icon}
      </Box>
      <Typography
        variant="body2"
        component="pre"
        sx={{
          fontFamily: "monospace",
          fontSize: "0.75rem",
          whiteSpace: wrap ? "pre-wrap" : "nowrap",
          overflow: wrap ? undefined : "hidden",
          textOverflow: wrap ? undefined : "ellipsis",
          m: 0,
          minWidth: 0,
          flex: 1,
          color: "text.primary",
        }}
      >
        {path}
        {inlineSuffix ? suffix : null}
      </Typography>
      {inlineSuffix ? null : suffix}
    </Box>
  );
}
