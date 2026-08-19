import { useMediaQuery, useTheme } from "@mui/material";
import { type ReactNode, createContext, useContext, useMemo } from "react";
import { setIsRightPaneHidden, setLeftPaneHidden } from "../commands/tabCommands";
import { layoutStore } from "../state/layoutStore";
import { workbenchNavigationStore } from "../state/workbenchNavigationStore";

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
 * Computes workspace pane collapsed/expanded state from breakpoints and manual
 * toggles. The cross-store join reads the Workbench layout and navigation
 * Stores; this hook adds the MUI breakpoint logic and the toggle actions
 * (React/UI-local).
 */
export function useWorkspacePaneVisibility(): WorkspacePaneVisibilityValue {
  const theme = useTheme();
  const leftCollapsedByBreakpoint = useMediaQuery(theme.breakpoints.down("md"));
  const rightCollapsedByBreakpoint = useMediaQuery(theme.breakpoints.down("lg"));
  const leftHidden = layoutStore((state) => state.isLeftPaneManuallyHidden);
  const selectedWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const rightHiddenByWorkspaceId = layoutStore((state) => state.isRightPaneHiddenByWorkspaceId);
  const isLeftPaneManuallyHidden = leftHidden;
  const isRightPaneManuallyHidden = rightHiddenByWorkspaceId[selectedWorkspaceId] ?? true;

  return useMemo(() => {
    const leftCollapsed = leftCollapsedByBreakpoint || isLeftPaneManuallyHidden;
    const rightCollapsed = rightCollapsedByBreakpoint || isRightPaneManuallyHidden;

    return {
      leftCollapsed,
      rightCollapsed,
      onToggleLeftPane: leftCollapsedByBreakpoint
        ? undefined
        : () => {
            setLeftPaneHidden(!isLeftPaneManuallyHidden);
          },
      showLeftPane: leftCollapsedByBreakpoint
        ? undefined
        : () => {
            setLeftPaneHidden(false);
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
