import { Box, useTheme } from "@mui/material";
import { getPiProviderIcon, getPiProviderIconColor, getPiProviderVisual } from "./piProviderVisuals";

const MONOCHROME_WHITE_FILTER = "brightness(0) saturate(100%) invert(1)";

/**
 * Renders one provider mark: a brand-colored SVG asset when available,
 * otherwise the catalog react-icon with its brand color (fallback icons
 * inherit the surrounding text color). Applies the visual `iconScale` for
 * assets whose mark does not fill the viewBox (e.g. the padded codex.svg).
 */
export function ProviderMark({ providerId, size }: { providerId: string; size: number }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const visual = getPiProviderVisual(providerId);
  const scale = visual?.iconScale ?? 1;
  const scaledTransform = scale !== 1 ? `scale(${scale})` : undefined;

  if (visual?.assetIcon) {
    return (
      <Box
        component="img"
        src={visual.assetIcon}
        alt=""
        aria-hidden
        sx={{
          width: size,
          height: size,
          maxWidth: "100%",
          maxHeight: "100%",
          display: "block",
          objectFit: "contain",
          flexShrink: 0,
          transform: scaledTransform,
          transformOrigin: "center",
          filter: visual.monochrome && isDarkMode ? MONOCHROME_WHITE_FILTER : undefined,
        }}
      />
    );
  }

  const Icon = visual?.icon ?? getPiProviderIcon(providerId);
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
      <Box sx={{ display: "inline-flex", transform: scaledTransform, transformOrigin: "center" }}>
        <Icon size={size} color={getPiProviderIconColor(providerId, isDarkMode)} aria-hidden />
      </Box>
    </Box>
  );
}
