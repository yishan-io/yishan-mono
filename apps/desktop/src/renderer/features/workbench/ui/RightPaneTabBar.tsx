import { Box, IconButton, Tooltip } from "@mui/material";
import type { WorkspaceRightPaneTab } from "@renderer/features/workbench";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PANE_HEADER_MIN_HEIGHT } from "../../../components/PaneHeader";
import { getRendererPlatform } from "../../../helpers/platform";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { DARK_SURFACE_COLORS } from "../../../theme";

export type RightPaneTabDef = {
  value: WorkspaceRightPaneTab;
  label: string;
  shortcutId: string;
  icon: ReactNode;
};

export type RightPaneTabBarProps = {
  tabs: RightPaneTabDef[];
  activeRightPaneTab: WorkspaceRightPaneTab;
  rightCollapsed: boolean;
  onToggleRightPane?: () => void;
  showRightPane?: () => void;
  onSelectTab: (tab: WorkspaceRightPaneTab) => void;
};

/**
 * Vertical tab bar rendered on the right edge of the main pane.
 * Always visible regardless of whether the right pane content is expanded or collapsed.
 * Clicking a tab opens the right pane to that tab, or toggles it closed if already active.
 */
export function RightPaneTabBar({
  tabs,
  activeRightPaneTab,
  rightCollapsed,
  onToggleRightPane,
  showRightPane,
  onSelectTab,
}: RightPaneTabBarProps) {
  const { t } = useTranslation();

  const handleTabClick = (tab: WorkspaceRightPaneTab) => {
    if (rightCollapsed) {
      onSelectTab(tab);
      showRightPane?.();
    } else if (activeRightPaneTab === tab) {
      onToggleRightPane?.();
    } else {
      onSelectTab(tab);
    }
  };

  const platform = getRendererPlatform();

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        width: 44,
        minWidth: 44,
        borderLeft: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        pt: `${PANE_HEADER_MIN_HEIGHT}px`,
        gap: 0.5,
        py: 0.5,
      }}
    >
      {tabs.map((tab) => {
        const isActive = !rightCollapsed && activeRightPaneTab === tab.value;
        const shortcutLabel = getShortcutDisplayLabelById(tab.shortcutId, platform);
        const tooltipText = shortcutLabel ? `${tab.label} (${shortcutLabel})` : tab.label;
        return (
          <Tooltip key={tab.value} title={tooltipText} placement="left">
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: 0.5,
                ...(isActive
                  ? {
                      mx: 0,
                      ml: "-1px",
                      pl: "1px",
                      bgcolor: (theme) =>
                        theme.palette.mode === "dark" ? DARK_SURFACE_COLORS.mainPane : theme.palette.background.default,
                      boxShadow: (theme) => `inset 0 -1px 0 0 ${theme.palette.divider}99`,
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      borderTopRightRadius: 4,
                      borderBottomRightRadius: 4,
                    }
                  : {}),
              }}
            >
              <IconButton
                aria-label={tab.label}
                onClick={() => handleTabClick(tab.value)}
                sx={{
                  width: 34,
                  height: 42,
                  borderRadius: 1,
                  color: isActive ? "text.primary" : "text.secondary",
                  "&:hover": {
                    bgcolor: isActive ? "transparent" : "action.hover",
                  },
                }}
              >
                {tab.icon}
              </IconButton>
            </Box>
          </Tooltip>
        );
      })}

      <Box sx={{ flex: 1 }} />
    </Box>
  );
}
