import { Box } from "@mui/material";
import { type DragEvent, useCallback, useState } from "react";
import type { SplitDirection } from "../store/split-pane";

export type SplitDropRegion = "left" | "right" | "top" | "bottom" | "center" | null;

export type SplitDropResult =
  | {
      direction: SplitDirection;
      placement: "first" | "second";
    }
  | { center: true };

/** Maps a drop region to the split parameters. */
export function resolveDropResult(region: SplitDropRegion): SplitDropResult | null {
  switch (region) {
    case "left":
      return { direction: "horizontal", placement: "first" };
    case "right":
      return { direction: "horizontal", placement: "second" };
    case "top":
      return { direction: "vertical", placement: "first" };
    case "bottom":
      return { direction: "vertical", placement: "second" };
    case "center":
      return { center: true };
    default:
      return null;
  }
}

type SplitDropZoneProps = {
  paneId: string;
  /** Whether to show the drop overlay. Only shown when a tab is being dragged. */
  active: boolean;
  /** Called when a tab is dropped on a region. Includes the dragged tab id from dataTransfer. */
  onDrop: (paneId: string, region: SplitDropRegion, draggedTabId: string) => void;
  children: React.ReactNode;
};

/** Resolves which region the cursor is in based on position within the element. */
function resolveRegion(event: DragEvent, element: HTMLElement): SplitDropRegion {
  const rect = element.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  const edgeThreshold = 0.3;

  if (x < edgeThreshold) return "left";
  if (x > 1 - edgeThreshold) return "right";
  if (y < edgeThreshold) return "top";
  if (y > 1 - edgeThreshold) return "bottom";
  return "center";
}

const regionHighlightSx: Record<string, object> = {
  left: { left: 0, top: 0, bottom: 0, width: "50%" },
  right: { right: 0, top: 0, bottom: 0, width: "50%" },
  top: { left: 0, right: 0, top: 0, height: "50%" },
  bottom: { left: 0, right: 0, bottom: 0, height: "50%" },
  center: { left: 0, right: 0, top: 0, bottom: 0 },
};

/**
 * Overlay that provides drop-target regions for split pane creation.
 *
 * When a tab drag is active, this renders edge/center zones over the pane content.
 * Dropping on an edge creates a new split; dropping on center merges the tab.
 */
export function SplitDropZone({ paneId, active, onDrop, children }: SplitDropZoneProps) {
  const [activeRegion, setActiveRegion] = useState<SplitDropRegion>(null);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!active) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setActiveRegion(resolveRegion(event, event.currentTarget));
    },
    [active],
  );

  const handleDragLeave = useCallback(() => {
    setActiveRegion(null);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!active) return;
      event.preventDefault();
      event.stopPropagation();
      const region = resolveRegion(event, event.currentTarget);
      const draggedTabId =
        event.dataTransfer.getData("application/x-tab-id") || event.dataTransfer.getData("text/plain");
      onDrop(paneId, region, draggedTabId);
      setActiveRegion(null);
    },
    [active, paneId, onDrop],
  );

  return (
    <Box
      data-testid={`split-drop-zone-${paneId}`}
      sx={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {active && activeRegion && (
        <Box
          data-testid={`split-drop-highlight-${activeRegion}`}
          sx={{
            position: "absolute",
            pointerEvents: "none",
            zIndex: 10,
            bgcolor: "primary.main",
            opacity: 0.12,
            transition: "all 120ms ease",
            borderRadius: 0,
            ...regionHighlightSx[activeRegion],
          }}
        />
      )}
    </Box>
  );
}
