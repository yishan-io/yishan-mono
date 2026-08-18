import { Paper } from "@mui/material";
import type { PaperProps, SxProps, Theme } from "@mui/material";

const floatingSurfaceSx: SxProps<Theme> = {
  bgcolor: "background.default",
  border: (theme) => `1px solid ${theme.palette.divider}`,
  backgroundImage: "none",
};

type FloatingSurfaceProps = Omit<PaperProps, "elevation">;

/** Renders the shared elevated surface used by renderer-owned floating menus. */
export function FloatingSurface({ children, sx, ...paperProps }: FloatingSurfaceProps) {
  const mergedSx = Array.isArray(sx) ? [floatingSurfaceSx, ...sx] : sx ? [floatingSurfaceSx, sx] : floatingSurfaceSx;

  return (
    <Paper {...paperProps} elevation={3} sx={mergedSx}>
      {children}
    </Paper>
  );
}
