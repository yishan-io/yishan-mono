import { useMediaQuery, useTheme } from "@mui/material";
import { type ReactNode, createContext, useContext, useMemo } from "react";
import { layoutStore } from "../store/settings/layoutStore";
import { workspaceStore } from "../store/workspaceStore";
import { workspaceUiStore } from "../store/workspaceUiStore";

export type WorkspacePaneVisibilityValue = {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeftPane?: () => void;
  onToggleRightPane?: () => void;
  showLeftPane?: () => void;
  showRightPane?: () => void;
};

const WorkspacePaneVisibilityContext = createContext<WorkspacePaneVisibilityValue>({
  leftCollapsed: false,
  rightCollapsed: false,
  onToggleLeftPane: undefined,
  onToggleRightPane: undefined,
  showLeftPane: undefined,
  showRightPane: undefined,
});

/**
 * Computes workspace pane collapsed/expanded state from breakpoints and manual toggles.
 * Right-pane visibility is per-workspace (keyed by the currently selected workspace).
 */
export function useWorkspacePaneVisibility(): WorkspacePaneVisibilityValue {
  const theme = useTheme();
  const leftCollapsedByBreakpoint = useMediaQuery(theme.breakpoints.down("md"));
  const rightCollapsedByBreakpoint = useMediaQuery(theme.breakpoints.down("lg"));
  const isLeftPaneManuallyHidden = layoutStore((state) => state.isLeftPaneManuallyHidden);
  const setIsLeftPaneManuallyHidden = layoutStore((state) => state.setIsLeftPaneManuallyHidden);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const isRightPaneManuallyHidden = workspaceUiStore(
    (state) => state.isRightPaneHiddenByWorkspaceId[selectedWorkspaceId] ?? true,
  );
  const setIsRightPaneHidden = workspaceUiStore((state) => state.setIsRightPaneHidden);

  return useMemo(() => {
    const leftCollapsed = leftCollapsedByBreakpoint || isLeftPaneManuallyHidden;
    const rightCollapsed = rightCollapsedByBreakpoint || isRightPaneManuallyHidden;

    return {
      leftCollapsed,
      rightCollapsed,
      onToggleLeftPane: leftCollapsedByBreakpoint
        ? undefined
        : () => {
            setIsLeftPaneManuallyHidden(!isLeftPaneManuallyHidden);
          },
      showLeftPane: leftCollapsedByBreakpoint
        ? undefined
        : () => {
            setIsLeftPaneManuallyHidden(false);
          },
      onToggleRightPane: rightCollapsedByBreakpoint
        ? undefined
        : () => {
            setIsRightPaneHidden(selectedWorkspaceId, !isRightPaneManuallyHidden);
          },
      showRightPane: rightCollapsedByBreakpoint
        ? undefined
        : () => {
            setIsRightPaneHidden(selectedWorkspaceId, false);
          },
    };
  }, [
    isLeftPaneManuallyHidden,
    isRightPaneManuallyHidden,
    leftCollapsedByBreakpoint,
    rightCollapsedByBreakpoint,
    selectedWorkspaceId,
    setIsLeftPaneManuallyHidden,
    setIsRightPaneHidden,
  ]);
}

/**
 * Shares workspace pane visibility and toggle controls with nested workspace views.
 */
export function WorkspacePaneVisibilityProvider({
  value,
  children,
}: {
  value: WorkspacePaneVisibilityValue;
  children: ReactNode;
}) {
  return <WorkspacePaneVisibilityContext.Provider value={value}>{children}</WorkspacePaneVisibilityContext.Provider>;
}

/**
 * Reads workspace pane visibility state and actions from context.
 */
export function useWorkspacePaneVisibilityContext(): WorkspacePaneVisibilityValue {
  return useContext(WorkspacePaneVisibilityContext);
}
