import { Box } from "@mui/material";
import type { ReactNode } from "react";

/**
 * Shared pane header styling constants used across workspace pane headers.
 *
 * @example
 * ```tsx
 * <PaneHeader>
 *   <IconButton size="small">...</IconButton>
 *   <Typography variant="body2">Title</Typography>
 * </PaneHeader>
 * ```
 */
export const PANE_HEADER_MIN_HEIGHT = 42;

/** Width reserved for macOS traffic-light window controls when the left sidebar is hidden. */
export const MAC_WINDOW_CONTROLS_INSET_WIDTH = 72;

export type PaneHeaderProps = {
  children: ReactNode;
  /** When true (default), applies `electron-webkit-app-region-drag` so the header is a window drag handle. */
  windowDraggable?: boolean;
  /**
   * When true, inserts a spacer at the far left to clear the macOS traffic-light window controls.
   * Typically set to `getRendererPlatform() === "darwin" && leftCollapsed`.
   */
  showMacInset?: boolean;
  /** Optional data-testid forwarded to the mac inset spacer element. */
  macInsetTestId?: string;
  /** Override the default `justifyContent` value ("space-between"). */
  justifyContent?: "space-between" | "flex-start" | "flex-end" | "center";
  /** Extra padding-y override. Defaults to 0. */
  py?: number;
  /** Optional data-testid attribute for testing. */
  "data-testid"?: string;
};

/**
 * Renders one standardized pane header bar used across workspace left, right, and main panes.
 *
 * Provides the consistent 42px minimum height, horizontal padding, bottom border,
 * `background.paper` fill, and flex alignment that was previously duplicated in
 * `LeftPaneView`, `RightPaneView`, and `MainPaneTitleBarView` as `paneHeaderSx`.
 *
 * Set `windowDraggable={false}` on the rare header that should not be a drag region.
 * Set `showMacInset` when the left sidebar may be hidden on macOS.
 */
export function PaneHeader({
  children,
  windowDraggable = true,
  showMacInset = false,
  macInsetTestId,
  justifyContent = "space-between",
  py = 0,
  "data-testid": dataTestId,
}: PaneHeaderProps) {
  return (
    <Box
      component="header"
      className={windowDraggable ? "electron-webkit-app-region-drag" : undefined}
      data-testid={dataTestId}
      sx={(theme) => ({
        minHeight: PANE_HEADER_MIN_HEIGHT,
        px: 1.5,
        ...(showMacInset
          ? {
              pl: `calc(${theme.spacing(1.5)} + ${MAC_WINDOW_CONTROLS_INSET_WIDTH}px)`,
            }
          : {}),
        py,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        display: "flex",
        alignItems: "center",
        justifyContent,
        position: "relative",
      })}
    >
      {showMacInset ? (
        <Box
          data-testid={macInsetTestId}
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: MAC_WINDOW_CONTROLS_INSET_WIDTH,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {children}
    </Box>
  );
}
