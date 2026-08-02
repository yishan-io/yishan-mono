import { Box, useTheme } from "@mui/material";
import { getPiProviderCatalogEntry, getPiProviderIcon, getPiProviderIconColor } from "../../helpers/piProviders";

const MONOCHROME_WHITE_FILTER = "brightness(0) saturate(100%) invert(1)";

/**
 * Renders one provider mark: a brand-colored SVG asset when available,
 * otherwise the catalog react-icon with its brand color (fallback icons
 * inherit the surrounding text color).
 */
export function ProviderMark({ providerId, size }: { providerId: string; size: number }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const entry = getPiProviderCatalogEntry(providerId);

  if (entry?.assetIcon) {
    return (
      <Box
        component="img"
        src={entry.assetIcon}
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
          filter: entry.monochrome && isDarkMode ? MONOCHROME_WHITE_FILTER : undefined,
        }}
      />
    );
  }

  const Icon = getPiProviderIcon(providerId);
  return <Icon size={size} color={getPiProviderIconColor(providerId, isDarkMode)} aria-hidden />;
}
