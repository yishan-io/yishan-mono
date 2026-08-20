import { Box, useTheme } from "@mui/material";
import { getPiProviderIcon, getPiProviderIconColor, getPiProviderVisual } from "./piProviderVisuals";

/**
 * Renders one provider mark: the brand-color variant when the brand ships one
 * (both light and dark mode), otherwise the mono/react-icon mark with its
 * brand color (or the inherited text color). Color variants ignore `color`.
 */
export function ProviderMark({ providerId, size }: { providerId: string; size: number }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const visual = getPiProviderVisual(providerId);
  const Icon = visual?.ColorIcon ?? getPiProviderIcon(providerId);
  const color = getPiProviderIconColor(providerId, isDarkMode);

  return (
    <Box
      sx={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={size} color={color} aria-hidden />
    </Box>
  );
}
