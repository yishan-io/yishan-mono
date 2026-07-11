import { Box } from "@mui/material";
import { useCallback } from "react";
import { createPortal } from "react-dom";
import type { WorkspaceTab } from "../../store/types";
import { WorkspaceAgentChatSurface } from "./WorkspaceAgentChatSurface";
import { getOrCreateRuntimeRoot } from "./runtime/runtimeRoot";
import type { WorkspaceTabPlacement } from "./useWorkspaceTabPlacements";

type WorkspaceTabSurfaceLayerProps = {
  isActive: boolean;
  isDraggingSplit: boolean;
  workspaceTabs: WorkspaceTab[];
  tabPlacements: Map<string, WorkspaceTabPlacement>;
  lastKnownRectByTabIdRef: React.MutableRefObject<
    Record<string, { left: number; top: number; width: number; height: number }>
  >;
  handleFocusPane: (paneId: string) => void;
  renderTabContent: (tab: WorkspaceTab, isSelected: boolean, isInActivePane: boolean) => React.ReactNode;
};

/** Renders fixed-position portal surfaces for active tab contents, aligned to pane placeholders. */
export function WorkspaceTabSurfaceLayer({
  isActive,
  isDraggingSplit,
  workspaceTabs,
  tabPlacements,
  lastKnownRectByTabIdRef,
  handleFocusPane,
  renderTabContent,
}: WorkspaceTabSurfaceLayerProps) {
  const renderTabSurface = useCallback(
    (
      tab: WorkspaceTab,
      isSelected: boolean,
      isInActivePane: boolean,
      rect: { left: number; top: number; width: number; height: number } | null,
      paneId: string,
    ) => {
      const hasArea = Boolean(rect && rect.width > 1 && rect.height > 1);
      if (hasArea && rect) {
        lastKnownRectByTabIdRef.current[tab.id] = rect;
      }
      const effectiveRect = rect ?? lastKnownRectByTabIdRef.current[tab.id] ?? null;
      const shouldShow =
        isActive && isSelected && Boolean(effectiveRect && effectiveRect.width > 1 && effectiveRect.height > 1);
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
          key={tab.id}
          sx={style}
          onMouseDown={() => {
            if (!isInActivePane) {
              handleFocusPane(paneId);
            }
          }}
        >
          {renderTabContent(tab, isSelected, isInActivePane)}
        </Box>
      );
    },
    [handleFocusPane, isActive, isDraggingSplit, lastKnownRectByTabIdRef, renderTabContent],
  );

  return createPortal(
    <Box
      sx={{
        position: "fixed",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        pointerEvents: "none",
        opacity: isDraggingSplit ? 0.28 : 1,
        transition: "opacity 120ms ease-out",
      }}
    >
      {workspaceTabs.map((tab) => {
        const placement = tabPlacements.get(tab.id);
        const isSelected = placement?.selected ?? false;
        const isInActivePane = placement?.activePane ?? false;
        const rect = placement?.rect ?? null;
        const paneId = placement?.paneId ?? "";

        if (tab.kind === "agent-chat") {
          return (
            <WorkspaceAgentChatSurface
              key={tab.id}
              tab={tab}
              isWorkspaceActive={isActive}
              isDraggingSplit={isDraggingSplit}
              isSelected={isSelected}
              isInActivePane={isInActivePane}
              rect={rect}
              paneId={paneId}
              lastKnownRectByTabIdRef={lastKnownRectByTabIdRef}
              handleFocusPane={handleFocusPane}
            />
          );
        }

        return renderTabSurface(tab, isSelected, isInActivePane, rect, paneId);
      })}
    </Box>,
    getOrCreateRuntimeRoot(),
  );
}
