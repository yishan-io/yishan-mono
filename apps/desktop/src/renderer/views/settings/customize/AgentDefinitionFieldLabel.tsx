import { Typography } from "@mui/material";
import type { ReactNode } from "react";

/**
 * Static field label rendered above the control instead of inside it. The
 * control itself keeps an aria-label (matching the label text) so the
 * accessible name survives the visual move.
 */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
      {children}
    </Typography>
  );
}
