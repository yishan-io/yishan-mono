import { Box } from "@mui/material";
import type { ReactNode, RefObject } from "react";
import { ColumnSeparator } from "./ColumnSeparator";

export const SPLIT_PANE_SEPARATOR_PX = "16px";

type SplitDirection = "horizontal" | "vertical";

type SplitPaneLayoutProps = {
  layoutRef?: RefObject<HTMLDivElement | null>;
  direction?: SplitDirection;
  position: "left" | "right" | "top" | "bottom";
  collapsed: boolean;
  resizeLabel: string;
  sideContent: ReactNode;
  onResizeStart: (clientPos: number) => void;
  onResizeMove?: (clientPos: number) => void;
  onResizeEnd?: () => void;
  children: ReactNode;
};

function resolveOrientation(direction: SplitDirection): "horizontal" | "vertical" {
  return direction === "vertical" ? "vertical" : "horizontal";
}

function isSideFirst(position: "left" | "right" | "top" | "bottom"): boolean {
  return position === "left" || position === "top";
}

export function SplitPaneLayout({
  layoutRef,
  direction = "horizontal",
  position,
  collapsed,
  resizeLabel,
  sideContent,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  children,
}: SplitPaneLayoutProps) {
  const orientation = resolveOrientation(direction);
  const isVertical = direction === "vertical";
  const minDim = isVertical ? { minHeight: 0 } : { minWidth: 0 };

  const separator = (
    <Box sx={{ display: collapsed ? "none" : "block" }}>
      <ColumnSeparator
        orientation={orientation}
        ariaLabel={resizeLabel}
        onResizeStart={onResizeStart}
        onResizeMove={onResizeMove}
        onResizeEnd={onResizeEnd}
      />
    </Box>
  );

  const side = <Box sx={{ display: collapsed ? "none" : "block", ...minDim }}>{sideContent}</Box>;

  const primary = <Box sx={{ flex: 1, ...minDim }}>{children}</Box>;

  const sideFirst = isSideFirst(position);

  return (
    <Box
      ref={layoutRef}
      sx={{
        display: "flex",
        flexDirection: isVertical ? "column" : "row",
        alignItems: "stretch",
        width: "100%",
        height: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {sideFirst ? (
        <>
          {side}
          {separator}
          {primary}
        </>
      ) : (
        <>
          {primary}
          {separator}
          {side}
        </>
      )}
    </Box>
  );
}
