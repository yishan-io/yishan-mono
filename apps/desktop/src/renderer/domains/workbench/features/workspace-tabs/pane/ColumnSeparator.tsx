import { Box } from "@mui/material";
import { useCallback, useRef, useState } from "react";

type ColumnSeparatorProps = {
  ariaLabel: string;
  orientation?: "horizontal" | "vertical";
  baseWidth?: string;
  hoverWidth?: string;
  onResizeStart: (clientPos: number) => void;
  onResizeMove?: (clientPos: number) => void;
  onResizeEnd?: () => void;
};

/**
 * Draggable column separator that uses pointer capture to ensure reliable
 * resize behaviour even when the cursor passes over `-webkit-app-region: drag`
 * zones (which swallow regular mouse events in production Electron builds).
 */
export function ColumnSeparator({
  ariaLabel,
  orientation = "horizontal",
  baseWidth = "3px",
  hoverWidth = "3px",
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: ColumnSeparatorProps) {
  const [dragging, setDragging] = useState(false);
  const separatorRef = useRef<HTMLDivElement>(null);
  const isVertical = orientation === "vertical";
  const clientAxis = isVertical ? "clientY" : "clientX";
  const cursor = isVertical ? "row-resize" : "col-resize";
  const sizeProp = isVertical
    ? { height: baseWidth, minHeight: baseWidth, width: "100%" }
    : { width: baseWidth, minWidth: baseWidth, height: "100%" };

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      onResizeStart(event[clientAxis]);
    },
    [onResizeStart, clientAxis],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      onResizeMove?.(event[clientAxis]);
    },
    [dragging, onResizeMove, clientAxis],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;

      setDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
      onResizeEnd?.();
    },
    [dragging, onResizeEnd],
  );

  const pseudoEdge = isVertical
    ? { left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: "1px" }
    : { top: 0, bottom: 0, left: "50%", transform: "translateX(-50%)", width: "1px" };

  const hoverEdge = isVertical
    ? { left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: hoverWidth }
    : { top: 0, bottom: 0, left: "50%", transform: "translateX(-50%)", width: hoverWidth };

  return (
    <Box
      ref={separatorRef}
      role="separator"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className="electron-webkit-app-region-no-drag"
      data-dragging={dragging ? "true" : "false"}
      sx={{
        ...sizeProp,
        flexShrink: 0,
        cursor,
        borderRadius: 999,
        position: "relative",
        overflow: "visible",
        bgcolor: "transparent",
        touchAction: "none",
        "&::before": {
          content: '""',
          position: "absolute",
          ...pseudoEdge,
          bgcolor: "divider",
          opacity: 0.55,
          pointerEvents: "none",
        },
        "&::after": {
          content: '""',
          position: "absolute",
          ...hoverEdge,
          borderRadius: 999,
          bgcolor: "primary.main",
          opacity: 0,
          transition: "opacity 120ms ease",
          pointerEvents: "none",
        },
        "&:hover": {
          "&::after": {
            opacity: 0.35,
          },
        },
        '&[data-dragging="true"]': {
          "&::after": {
            opacity: 0.8,
          },
        },
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
