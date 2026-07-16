import { Box, Collapse, Typography } from "@mui/material";
import type { ReactNode } from "react";

const TOOL_OUTPUT_TEXT_SX = {
  fontFamily: "monospace",
  fontSize: "0.75rem",
  whiteSpace: "pre-wrap",
  m: 0,
  maxHeight: 200,
  overflow: "auto",
} as const;

/** Shared expandable output section for plain-text tool results. */
export function ToolOutputSection({
  open,
  resultText,
  isError,
  label = "output",
  children,
}: {
  open: boolean;
  resultText: string;
  isError: boolean;
  label?: string;
  children?: ReactNode;
}) {
  if (!resultText) {
    return null;
  }

  return (
    <Collapse in={open}>
      <Box sx={{ px: 1.5, py: 1, bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {label}
          {isError ? " (error)" : ""}
        </Typography>
        {children ?? (
          <Typography
            variant="body2"
            component="pre"
            sx={{
              ...TOOL_OUTPUT_TEXT_SX,
              color: isError ? "error.main" : undefined,
            }}
          >
            {resultText}
          </Typography>
        )}
      </Box>
    </Collapse>
  );
}
