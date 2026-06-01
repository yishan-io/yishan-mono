import { Badge, Box, IconButton, Tooltip } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuFolderTree, LuGitBranch, LuGitPullRequest, LuMic } from "react-icons/lu";
import type { WorkspaceRightPaneTab } from "../../../store/workspaceUiStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { workspaceUiStore } from "../../../store/workspaceUiStore";
import { layoutStore } from "../../../store/settings/layoutStore";
import { DARK_SURFACE_COLORS } from "../../../theme";
import { PANE_HEADER_MIN_HEIGHT } from "../../../components/PaneHeader";
import { getRendererPlatform } from "../../../helpers/platform";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";

/** Custom event name dispatched when the voice mic button in the tab bar is clicked. */
export const VOICE_RECORD_REQUEST_EVENT = "yishan:voice-record-request";
/** Custom event name dispatched when floating voice UI visibility changes. */
export const VOICE_RECORDING_VISIBILITY_EVENT = "yishan:voice-recording-visibility";

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
  const activeRightPaneTab = workspaceUiStore((state) => state.rightPaneTab);
  const setRightPaneTab = workspaceUiStore((state) => state.setRightPaneTab);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const changesCount = workspaceStore((state) => state.gitChangesCountByWorkspaceId[selectedWorkspaceId] ?? 0);
  const isVoiceInputEnabled = layoutStore((state) => state.isVoiceInputEnabled);
  const [isVoiceRecordingVisible, setIsVoiceRecordingVisible] = useState(false);

  const handleTabClick = (tab: WorkspaceRightPaneTab) => {
    if (rightCollapsed) {
      setRightPaneTab(tab);
      showRightPane?.();
    } else if (activeRightPaneTab === tab) {
      onToggleRightPane?.();
    } else {
      setRightPaneTab(tab);
    }
  };

  useEffect(() => {
    const handleVisibilityChange = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
      setIsVoiceRecordingVisible(Boolean(detail?.visible));
    };

    window.addEventListener(VOICE_RECORDING_VISIBILITY_EVENT, handleVisibilityChange);
    return () => {
      window.removeEventListener(VOICE_RECORDING_VISIBILITY_EVENT, handleVisibilityChange);
    };
  }, []);

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
          <Tooltip key={tab.value} title={tooltipText} placement="left" arrow>
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
                        theme.palette.mode === "dark"
                          ? DARK_SURFACE_COLORS.mainPane
                          : theme.palette.background.default,
                      borderBottom: 1,
                      borderColor: "divider",
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

      {/* Spacer pushes voice button to bottom */}
      <Box sx={{ flex: 1 }} />

      {/* Voice input mic button — visible when voice input is enabled */}
      {isVoiceInputEnabled && !isVoiceRecordingVisible && (
        <Tooltip title={t("settings.terminal.voice.title")} placement="left" arrow>
          <IconButton
            size="small"
            aria-label={t("settings.terminal.voice.title")}
            onClick={() => {
              window.dispatchEvent(new CustomEvent(VOICE_RECORD_REQUEST_EVENT));
            }}
            sx={{
              width: 34,
              height: 42,
              borderRadius: 1,
              color: "text.secondary",
              mx: 0.5,
              mb: 0.5,
              "&:hover": {
                bgcolor: "action.hover",
              },
            }}
          >
            <LuMic size={18} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
