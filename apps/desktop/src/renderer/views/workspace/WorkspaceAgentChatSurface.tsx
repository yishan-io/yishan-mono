import { Box } from "@mui/material";
import { memo } from "react";
import type { MutableRefObject } from "react";
import type { WorkspaceTab } from "../../store/types";
import { AgentChatView } from "./AgentChatView";
import type { WorkspaceTabPlacement } from "./useWorkspaceTabPlacements";

type AgentChatTab = Extract<WorkspaceTab, { kind: "agent-chat" }>;
type SurfaceRect = NonNullable<WorkspaceTabPlacement["rect"]>;

type WorkspaceAgentChatSurfaceProps = {
  tab: AgentChatTab;
  isWorkspaceActive: boolean;
  isDraggingSplit: boolean;
  isSelected: boolean;
  isInActivePane: boolean;
  rect: WorkspaceTabPlacement["rect"];
  paneId: string;
  lastKnownRectByTabIdRef: MutableRefObject<Record<string, SurfaceRect>>;
  handleFocusPane: (paneId: string) => void;
};

function areRectsEqual(leftRect: WorkspaceTabPlacement["rect"], rightRect: WorkspaceTabPlacement["rect"]): boolean {
  if (!leftRect && !rightRect) {
    return true;
  }

  if (!leftRect || !rightRect) {
    return false;
  }

  return (
    leftRect.left === rightRect.left &&
    leftRect.top === rightRect.top &&
    leftRect.width === rightRect.width &&
    leftRect.height === rightRect.height
  );
}

function WorkspaceAgentChatSurfaceComponent({
  tab,
  isWorkspaceActive,
  isDraggingSplit,
  isSelected,
  isInActivePane,
  rect,
  paneId,
  lastKnownRectByTabIdRef,
  handleFocusPane,
}: WorkspaceAgentChatSurfaceProps) {
  const hasArea = Boolean(rect && rect.width > 1 && rect.height > 1);
  if (hasArea && rect) {
    lastKnownRectByTabIdRef.current[tab.id] = rect;
  }

  const effectiveRect = rect ?? lastKnownRectByTabIdRef.current[tab.id] ?? null;
  const shouldShow =
    isWorkspaceActive && isSelected && Boolean(effectiveRect && effectiveRect.width > 1 && effectiveRect.height > 1);

  const style = effectiveRect
    ? {
        position: "fixed" as const,
        left: effectiveRect.left,
        top: effectiveRect.top,
        width: effectiveRect.width,
        height: effectiveRect.height,
        display: shouldShow && !isDraggingSplit ? "flex" : "none",
        flexDirection: "column" as const,
        pointerEvents: shouldShow && !isDraggingSplit ? "auto" : "none",
      }
    : {
        position: "absolute" as const,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        display: "none",
        flexDirection: "column" as const,
        pointerEvents: "none",
      };

  return (
    <Box
      sx={style}
      onMouseDown={() => {
        if (!isInActivePane) {
          handleFocusPane(paneId);
        }
      }}
    >
      <AgentChatView
        tabId={tab.id}
        workspaceId={tab.workspaceId}
        cwd={tab.data.cwd}
        piSessionId={tab.data.piSessionId}
      />
    </Box>
  );
}

function areEqual(previousProps: WorkspaceAgentChatSurfaceProps, nextProps: WorkspaceAgentChatSurfaceProps): boolean {
  return (
    previousProps.tab.id === nextProps.tab.id &&
    previousProps.tab.workspaceId === nextProps.tab.workspaceId &&
    previousProps.tab.data.cwd === nextProps.tab.data.cwd &&
    previousProps.tab.data.piSessionId === nextProps.tab.data.piSessionId &&
    previousProps.isWorkspaceActive === nextProps.isWorkspaceActive &&
    previousProps.isDraggingSplit === nextProps.isDraggingSplit &&
    previousProps.isSelected === nextProps.isSelected &&
    previousProps.isInActivePane === nextProps.isInActivePane &&
    previousProps.paneId === nextProps.paneId &&
    areRectsEqual(previousProps.rect, nextProps.rect)
  );
}

/** Memoized portal surface for one agent chat tab to avoid unnecessary rerenders on unrelated tab switches. */
export const WorkspaceAgentChatSurface = memo(WorkspaceAgentChatSurfaceComponent, areEqual);
