import { useMediaQuery, useTheme } from "@mui/material";
import { type ReactNode, createContext, useContext, useMemo } from "react";
import { layoutStore } from "../store/settings/layoutStore";

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
 */
export function useWorkspacePaneVisibility(): WorkspacePaneVisibilityValue {
  const theme = useTheme();
  const leftCollapsedByBreakpoint = useMediaQuery(theme.breakpoints.down("md"));
  const rightCollapsedByBreakpoint = useMediaQuery(theme.breakpoints.down("lg"));
  const isLeftPaneManuallyHidden = layoutStore((state) => state.isLeftPaneManuallyHidden);
  const isRightPaneManuallyHidden = layoutStore((state) => state.isRightPaneManuallyHidden);
  const setIsLeftPaneManuallyHidden = layoutStore((state) => state.setIsLeftPaneManuallyHidden);
  const setIsRightPaneManuallyHidden = layoutStore((state) => state.setIsRightPaneManuallyHidden);

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
            setIsRightPaneManuallyHidden(!isRightPaneManuallyHidden);
          },
      showRightPane: rightCollapsedByBreakpoint
        ? undefined
        : () => {
            setIsRightPaneManuallyHidden(false);
          },
    };
  }, [
    isLeftPaneManuallyHidden,
    isRightPaneManuallyHidden,
    leftCollapsedByBreakpoint,
    rightCollapsedByBreakpoint,
    setIsLeftPaneManuallyHidden,
    setIsRightPaneManuallyHidden,
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
