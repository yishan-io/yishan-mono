import { Box, Typography } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { COLOR_PRIMITIVES } from "@yishan-io/design-tokens";
import type { ReactNode } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";

const TOOL_CARD_DARK_BACKGROUND = COLOR_PRIMITIVES.neutral.gray950;

const TOOL_CARD_PANEL_SX = {
  px: 1.5,
  py: 1,
  bgcolor: (theme: Theme) => (theme.palette.mode === "dark" ? TOOL_CARD_DARK_BACKGROUND : "action.hover"),
};

/** Shared shell around one tool-call card. */
export function ToolCardShell({
  children,
  isError,
  outlined = false,
}: {
  children: ReactNode;
  isError: boolean;
  outlined?: boolean;
}) {
  return (
    <Box
      sx={{
        mb: 0.5,
        border: outlined ? 1 : 0,
        borderColor: isError ? "error.main" : "primary.main",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      {children}
    </Box>
  );
}

/** Shared body panel used for compact tool summaries. */
export function ToolSummaryPanel({ children }: { children: ReactNode }) {
  return <Box sx={TOOL_CARD_PANEL_SX}>{children}</Box>;
}

/** Shared generic tool header used when no specialized tool renderer exists. */
export function ToolDefaultHeader({
  toolName,
  isError,
  onToggle,
  open,
}: {
  toolName: string;
  isError: boolean;
  onToggle: () => void;
  open: boolean;
}) {
  return (
    <Box
      onClick={onToggle}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: 0.75,
        cursor: "pointer",
        bgcolor: isError ? "error.main" : "primary.main",
        color: isError ? "error.contrastText" : "primary.contrastText",
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
        {toolName}
      </Typography>
      <Box component="span" sx={{ ml: "auto", display: "inline-flex", color: "inherit", width: 20, height: 20 }}>
        {open ? (
          <LuChevronDown data-testid="tool-chevron-down" size={14} />
        ) : (
          <LuChevronRight data-testid="tool-chevron-right" size={14} />
        )}
      </Box>
    </Box>
  );
}
