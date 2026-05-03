import { Badge, Box, IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuFolderTree, LuGitBranch, LuPanelRight } from "react-icons/lu";
import { getRendererPlatform } from "../../../helpers/platform";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { workspacePaneStore } from "../../../store/workspacePaneStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { ChangesTabView } from "./ChangesTabView";
import { FileManagerView } from "./FileManagerView";

export type RightPaneViewProps = {
  onToggleRightPane?: () => void;
};

const paneHeaderSx = {
  minHeight: 42,
  px: 1.5,
  borderBottom: 1,
  borderColor: "divider",
  bgcolor: "background.paper",
  display: "flex",
  alignItems: "center",
} as const;

/**
 * Renders the workspace right pane with file and git changes tabs.
 */
export function RightPaneView({ onToggleRightPane }: RightPaneViewProps = {}) {
  const { t } = useTranslation();
  const activeRightPaneTab = workspacePaneStore((state) => state.rightPaneTab);
  const openFileSearchRequestKey = workspacePaneStore((state) => state.fileSearchRequestKey);
  const setRightPaneTab = workspacePaneStore((state) => state.setRightPaneTab);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const changesCount = workspaceStore((state) => state.gitChangesCountByWorkspaceId[selectedWorkspaceId] ?? 0);
  const [lastHandledFileSearchRequestKey, setLastHandledFileSearchRequestKey] = useState(0);
  const toggleRightShortcutLabel = getShortcutDisplayLabelById("toggle-right-pane", getRendererPlatform());
  const toggleRightTooltipLabel = toggleRightShortcutLabel
    ? t("layout.toggleWithShortcut", {
        label: t("layout.toggleRightSidebar"),
        shortcut: toggleRightShortcutLabel,
      })
    : t("layout.toggleRightSidebar");

  const activeTab = activeRightPaneTab === "changes" ? "changes" : "files";

  return (
    <Box
      data-testid="dashboard-sidebar"
      sx={{
        width: "100%",
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      <Box component="header" className="electron-webkit-app-region-drag" sx={{ ...paneHeaderSx }}>
        <Box className="electron-webkit-app-region-no-drag" sx={{ minWidth: 0 }}>
          <ToggleButtonGroup
            value={activeTab}
            exclusive
            onChange={(_, nextTab: "files" | "changes" | null) => {
              if (nextTab) {
                setRightPaneTab(nextTab);
              }
            }}
            aria-label="Repository sections"
            sx={{
              gap: 1.5,
              overflow: "visible",
              "& .MuiToggleButton-root": {
                minHeight: 30,
                height: 30,
                minWidth: 30,
                px: 0.75,
                py: 0,
                overflow: "visible",
                border: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                typography: "body2",
                textTransform: "none",
                color: "text.secondary",
                borderRadius: 1,
                transition: "background-color 120ms ease, color 120ms ease",
                "&:hover": {
                  bgcolor: "action.hover",
                },
              },
              "& .MuiToggleButton-root.Mui-selected": {
                color: "text.primary",
                bgcolor: "action.selected",
              },
              "& .MuiToggleButton-root.Mui-selected:hover": {
                bgcolor: "action.selected",
              },
            }}
          >
            <ToggleButton value="files" disableRipple aria-label={t("files.files")}>
              <Tooltip title={t("files.files")} arrow>
                <Box
                  component="span"
                  sx={{ width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  <LuFolderTree size={15} />
                </Box>
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="changes" disableRipple aria-label={t("files.changes", { count: changesCount })}>
              <Tooltip title={t("files.changes")} arrow>
                <Box
                  component="span"
                  sx={{ width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Badge
                    badgeContent={changesCount}
                    color="primary"
                    max={99}
                    invisible={changesCount <= 0}
                    sx={{
                      "& .MuiBadge-badge": {
                        minWidth: 16,
                        height: 16,
                        fontSize: 10,
                        lineHeight: 1,
                      },
                    }}
                  >
                    <LuGitBranch size={15} />
                  </Badge>
                </Box>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }} />
        <Tooltip title={toggleRightTooltipLabel} arrow>
          <span>
            <IconButton
              className="electron-webkit-app-region-no-drag"
              size="small"
              aria-label={t("layout.toggleRightSidebar")}
              onClick={onToggleRightPane}
              disabled={!onToggleRightPane}
            >
              <LuPanelRight size={16} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box
        sx={{
          display: activeTab === "files" ? "block" : "none",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <FileManagerView
          openFileSearchRequestKey={openFileSearchRequestKey}
          lastHandledFileSearchRequestKey={lastHandledFileSearchRequestKey}
          onFileSearchRequestHandled={(requestKey) => {
            setLastHandledFileSearchRequestKey((currentValue) => Math.max(currentValue, requestKey));
          }}
        />
      </Box>
      <Box
        sx={{
          display: activeTab === "changes" ? "flex" : "none",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <ChangesTabView />
      </Box>
    </Box>
  );
}
