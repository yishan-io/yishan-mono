import { Box } from "@mui/material";
import type { ReactNode } from "react";

/** Renders route content as a full-surface overlay above the workspace view. */
export function WorkspaceOverlay({ children }: { children: ReactNode }) {
  return <Box sx={{ position: "absolute", inset: 0, zIndex: 100, bgcolor: "background.default" }}>{children}</Box>;
}
