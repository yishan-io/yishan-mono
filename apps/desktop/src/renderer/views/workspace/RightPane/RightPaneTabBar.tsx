import { Badge, Box, IconButton, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuFolderTree, LuGitBranch, LuGitPullRequest } from "react-icons/lu";
import { PANE_HEADER_MIN_HEIGHT } from "../../../components/PaneHeader";
import { getRendererPlatform } from "../../../helpers/platform";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { workspaceStore } from "../../../store/workspaceStore";
import { DEFAULT_RIGHT_PANE_TAB, type WorkspaceRightPaneTab } from "../../../store/workspaceUiStore";
import { workspaceUiStore } from "../../../store/workspaceUiStore";
import { DARK_SURFACE_COLORS } from "../../../theme";

export type RightPaneTabBarProps = {
  rightCollapsed: boolean;
  onToggleRightPane?: () => void;
  showRightPane?: () => void;
};

/**
 * Vertical tab bar rendered on the right edge of the main pane.
 * Always visible regardless of whether the right pane content is expanded or collapsed.
 * Clicking a tab opens the right pane to that tab, or toggles it closed if already active.
 */
export function RightPaneTabBar({ rightCollapsed, onToggleRightPane, showRightPane }: RightPaneTabBarProps) {
  const { t } = useTranslation();
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const activeRightPaneTab = workspaceUiStore(
    (state) => state.rightPaneTabByWorkspaceId[selectedWorkspaceId] ?? DEFAULT_RIGHT_PANE_TAB,
  );
  const setRightPaneTab = workspaceUiStore((state) => state.setRightPaneTab);
  const changesCount = workspaceStore((state) => state.gitChangesCountByWorkspaceId[selectedWorkspaceId] ?? 0);

  const handleTabClick = (tab: WorkspaceRightPaneTab) => {
    if (rightCollapsed) {
      setRightPaneTab(selectedWorkspaceId, tab);
      showRightPane?.();
    } else if (activeRightPaneTab === tab) {
      onToggleRightPane?.();
    } else {
      setRightPaneTab(selectedWorkspaceId, tab);
    }
  };

  const platform = getRendererPlatform();

  const tabs: Array<{ value: WorkspaceRightPaneTab; label: string; shortcutId: string; icon: React.ReactNode }> = [
    {
      value: "files",
      label: t("files.files"),
      shortcutId: "activate-files-pane",
      icon: <LuFolderTree size={18} />,
    },
    {
      value: "changes",
      label: t("files.changes"),
      shortcutId: "activate-changes-pane",
      icon: (
        <Badge
          badgeContent={changesCount}
          color="primary"
          max={99}
          invisible={changesCount <= 0}
          sx={{
            "& .MuiBadge-badge": {
              minWidth: 14,
              height: 14,
              fontSize: 9,
              lineHeight: 1,
            },
          }}
        >
          <LuGitBranch size={18} />
        </Badge>
      ),
    },
    {
      value: "pr",
      label: t("workspace.pr.tab"),
      shortcutId: "activate-pr-pane",
      icon: <LuGitPullRequest size={18} />,
    },
  ];

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
                size="small"
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
