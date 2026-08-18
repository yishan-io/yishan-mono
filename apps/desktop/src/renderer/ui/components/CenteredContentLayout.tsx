import { Box } from "@mui/material";
import type { ReactNode } from "react";

export type CenteredContentLayoutProps = {
  children: ReactNode;
  /** Maximum width of the centered content area. Defaults to 460. */
  maxWidth?: number;
  /** Horizontal padding. Defaults to 3. */
  px?: number;
  /** Optional CSS class on the root container. */
  className?: string;
};

/**
 * Renders a full-height, horizontally-and-vertically centered layout container.
 *
 * Use this for views that present a single focused content block in the center
 * of the viewport, such as login screens, onboarding flows, or empty-state
 * landing pages.
 *
 * @example
 * ```tsx
 * <CenteredContentLayout maxWidth={460}>
 *   <Stack spacing={2}>
 *     <Typography variant="h4">Welcome</Typography>
 *     <Button variant="contained">Get Started</Button>
 *   </Stack>
 * </CenteredContentLayout>
 * ```
 */
export function CenteredContentLayout({ children, maxWidth = 460, px = 3, className }: CenteredContentLayoutProps) {
  return (
    <Box
      className={className}
      sx={{
        height: "100%",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px,
        userSelect: "none",
      }}
    >
      <Box sx={{ width: "100%", maxWidth }}>{children}</Box>
    </Box>
  );
}
