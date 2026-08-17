import { useMediaQuery, useTheme } from "@mui/material";
import { type ReactNode, createContext, useContext, useMemo } from "react";
import { layoutStore } from "../../../../features/workbench/state/layoutStore";
import { useWorkspacePaneVisibilityState } from "../../../../app/selectors";
import { workspaceUiStore } from "../../../../features/workspace/state/workspaceUiStore";

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
 * toggles. The cross-store join lives in the Selector
 * (`useWorkspacePaneVisibilityState`); this hook adds the MUI breakpoint logic
 * and the toggle actions (React/UI-local).
 */
export function useWorkspacePaneVisibility(): WorkspacePaneVisibilityValue {
  const theme = useTheme();
  const leftCollapsedByBreakpoint = useMediaQuery(theme.breakpoints.down("md"));
  const rightCollapsedByBreakpoint = useMediaQuery(theme.breakpoints.down("lg"));
  const { leftCollapsed: isLeftPaneManuallyHidden, rightCollapsed: isRightPaneManuallyHidden, selectedWorkspaceId } =
    useWorkspacePaneVisibilityState();
  const setIsLeftPaneManuallyHidden = layoutStore((state) => state.setIsLeftPaneManuallyHidden);
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
