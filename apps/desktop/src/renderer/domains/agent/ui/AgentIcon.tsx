import { Box, useTheme } from "@mui/material";
import type { DesktopAgentKind } from "../providers/agentSettings";
import { type AgentIconContext, getAgentIconPresentation } from "./agentIconPresentation";

export type AgentIconProps = {
  agentKind: DesktopAgentKind;
  context: AgentIconContext;
  label?: string;
  decorative?: boolean;
};

/**
 * Renders one centralized agent icon variant with shared component and sizing
 * rules. Uses the brand-color variant when the brand ships one (both light and
 * dark mode), otherwise the mono glyph — white in dark mode, inherited text
 * color in light mode. Returns null gracefully when icon config is missing.
 */
export function AgentIcon({ agentKind, context, label, decorative = false }: AgentIconProps) {
  const theme = useTheme();
  const icon = getAgentIconPresentation(agentKind, context);

  if (!icon) {
    return null;
  }

  const isDarkMode = theme.palette.mode === "dark";
  const Icon = icon.ColorIcon ?? icon.Icon;
  return (
    <Box
      sx={{
        width: icon.slotSize,
        height: icon.slotSize,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon
        size={icon.slotSize}
        color={isDarkMode ? "#FFFFFF" : "currentColor"}
        role={decorative ? undefined : "img"}
        aria-hidden={decorative ? true : undefined}
        aria-label={decorative ? undefined : (label ?? "")}
      />
    </Box>
  );
}
