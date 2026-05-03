import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuPanelLeft, LuPlus } from "react-icons/lu";
import { getRendererPlatform } from "../../../helpers/platform";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { workspaceStore } from "../../../store/workspaceStore";
import { AppMenuView } from "../../layout/AppMenuView";
import { ProjectFilterPopoverView } from "./ProjectFilterPopoverView";
import { ProjectListView } from "./ProjectListView";

const paneHeaderSx = {
  minHeight: 42,
  px: 1.5,
  py: 0.75,
  borderBottom: 1,
  borderColor: "divider",
  bgcolor: "background.paper",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
} as const;

type LeftPaneViewProps = {
  onCreateRepository?: () => void;
  onToggleLeftPane?: () => void;
};

/** Renders repo/workspace navigation and top-level left pane chrome. */
export function LeftPaneView({ onCreateRepository, onToggleLeftPane }: LeftPaneViewProps = {}) {
  const { t } = useTranslation();
  const repos = workspaceStore((state) => state.projects);
  const displayRepoIds = workspaceStore((state) => state.displayProjectIds);
  const filteredRepos = repos.filter((repo) => displayRepoIds.includes(repo.id));
  const toggleLeftShortcutLabel = getShortcutDisplayLabelById("toggle-left-pane", getRendererPlatform());
  const toggleLeftTooltipLabel = toggleLeftShortcutLabel
    ? t("layout.toggleWithShortcut", {
        label: t("layout.toggleLeftSidebar"),
        shortcut: toggleLeftShortcutLabel,
      })
    : t("layout.toggleLeftSidebar");

  return (
    <Box
      data-testid="dashboard-left"
      sx={{
        width: "100%",
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      <Box component="header" className="electron-webkit-app-region-drag" sx={paneHeaderSx}>
        <Box
          className="electron-webkit-app-region-no-drag"
          sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", minWidth: 0, pr: 0.5 }}
        />
        <Stack direction="row" alignItems="center" spacing={0.25}>
          <Box className="electron-webkit-app-region-no-drag" sx={{ display: "flex", alignItems: "center" }}>
            <ProjectFilterPopoverView />
          </Box>
          <Tooltip title={toggleLeftTooltipLabel} arrow>
            <span>
              <IconButton
                className="electron-webkit-app-region-no-drag"
                size="small"
                aria-label={t("layout.toggleLeftSidebar")}
                onClick={onToggleLeftPane}
                disabled={!onToggleLeftPane}
              >
                <LuPanelLeft size={16} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>
      <ProjectListView />
      {filteredRepos.length === 0 ? (
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {t("project.filter.empty")}
          </Typography>
        </Box>
      ) : null}
      <Box
        sx={{
          mt: "auto",
          display: "flex",
          alignItems: "center",
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Button
          variant="outlined"
          startIcon={<LuPlus size={14} />}
          onClick={onCreateRepository}
          aria-label={t("project.actions.addRepository")}
          sx={{
            flex: 1,
            textTransform: "none",
            color: "text.secondary",
            bgcolor: "transparent",
            borderRadius: 0,
            border: 0,
            borderRight: "1px solid",
            borderColor: "divider",
            ":hover": {
              bgcolor: "action.hover",
            },
          }}
        >
          {t("project.actions.addRepository")}
        </Button>
        <AppMenuView iconOnly />
      </Box>
    </Box>
  );
}
