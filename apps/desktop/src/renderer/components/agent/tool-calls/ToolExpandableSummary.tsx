import { Box, IconButton } from "@mui/material";
import type { ReactNode } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";

/** Shared expandable summary row with the trailing chevron affordance. */
export function ToolExpandableSummary({
  children,
  onToggle,
  open,
  testId,
}: {
  children: ReactNode;
  onToggle: () => void;
  open: boolean;
  testId?: string;
}) {
  return (
    <Box
      data-testid={testId}
      onClick={onToggle}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        cursor: "pointer",
      }}
    >
      {children}
      <IconButton size="small" sx={{ width: 20, height: 20, flexShrink: 0, ml: "auto" }}>
        {open ? (
          <LuChevronDown data-testid="tool-chevron-down" size={14} />
        ) : (
          <LuChevronRight data-testid="tool-chevron-right" size={14} />
        )}
      </IconButton>
    </Box>
  );
}
