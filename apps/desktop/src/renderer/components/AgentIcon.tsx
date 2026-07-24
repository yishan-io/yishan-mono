import { Box, useTheme } from "@mui/material";
import { type AgentIconContext, type DesktopAgentKind, getAgentIconPresentation } from "../helpers/agentSettings";

export type AgentIconProps = {
  agentKind: DesktopAgentKind;
  context: AgentIconContext;
  label?: string;
  decorative?: boolean;
};

/**
 * Renders one centralized agent icon variant with shared asset, ratio, and scale rules.
 * Returns null gracefully when agent icon configuration is unavailable.
 */
export function AgentIcon({ agentKind, context, label, decorative = false }: AgentIconProps) {
  const theme = useTheme();
  const icon = getAgentIconPresentation(agentKind, context);

  if (!icon) {
    return null;
  }

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
      <Box
        component="img"
        src={icon.src}
        alt={decorative ? "" : (label ?? "")}
        aria-hidden={decorative ? true : undefined}
        sx={{
          width: icon.width,
          height: icon.height,
          maxWidth: "100%",
          maxHeight: "100%",
          display: "block",
          objectFit: "contain",
          filter: icon.filterByTheme[theme.palette.mode] ?? "none",
          transform: `scale(${icon.scale})`,
          transformOrigin: "center",
        }}
      />
    </Box>
  );
}
