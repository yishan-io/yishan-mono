import { Box } from "@mui/material";
import type { ReactNode } from "react";
import { getRendererPlatform } from "../../helpers/platform";

export type SettingsPageLayoutProps = {
  /** The sidebar navigation content (left pane). */
  sidebar: ReactNode;
  /** The main settings content area (right pane). */
  children: ReactNode;
  /** Sidebar fixed width in pixels. Defaults to 272. */
  sidebarWidth?: number;
};

/**
 * Renders the two-pane settings page layout with a fixed-width sidebar on the
 * left and a flexible content area on the right.
 *
 * On macOS, the content area receives additional top padding to avoid the
 * native window controls.
 *
 * @example
 * ```tsx
 * <SettingsPageLayout
 *   sidebar={
 *     <>
 *       <Typography>Settings</Typography>
 *       <List>...</List>
 *     </>
 *   }
 * >
 *   <AccountSettingsView />
 * </SettingsPageLayout>
 * ```
 */
export function SettingsPageLayout({ sidebar, children, sidebarWidth = 272 }: SettingsPageLayoutProps) {
  const shouldReserveMacWindowControlsInset = getRendererPlatform() === "darwin";

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        minHeight: 0,
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          borderRight: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {sidebar}
      </Box>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          px: 2.5,
          pb: 2.5,
          pt: shouldReserveMacWindowControlsInset ? 4.5 : 2.5,
          overflowY: "auto",
        }}
      >
        <Box sx={{ maxWidth: 900, mx: "auto" }}>{children}</Box>
      </Box>
    </Box>
  );
}
