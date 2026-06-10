import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LuChartBar, LuPanelLeft, LuPlus, LuZap } from "react-icons/lu";
import { PaneHeader } from "../../../components/PaneHeader";
import { PaneToggleButton } from "../../../components/PaneToggleButton";
import { getRendererPlatform } from "../../../helpers/platform";
import { useCommands } from "../../../hooks/useCommands";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { workspaceStore } from "../../../store/workspaceStore";
import { workspaceUiStore } from "../../../store/workspaceUiStore";
import { AppMenuView } from "../../layout/AppMenuView";
import { ProjectFilterPopoverView } from "./ProjectFilterPopoverView";
import { ProjectListView } from "./ProjectListView";

type LeftPaneViewProps = {
  onCreateRepository?: () => void;
  onToggleLeftPane?: () => void;
};

/** Renders repo/workspace navigation and top-level left pane chrome. */
export function LeftPaneView({ onCreateRepository, onToggleLeftPane }: LeftPaneViewProps = {}) {
  const { t } = useTranslation();
  const repos = workspaceStore((state) => state.projects);
  const displayRepoIds = workspaceStore((state) => state.displayProjectIds);
  const isProjectsLoaded = workspaceStore((state) => state.isProjectsLoaded);
  const filteredRepos = repos.filter((repo) => displayRepoIds.includes(repo.id));
  const toggleLeftShortcutLabel = getShortcutDisplayLabelById("toggle-left-pane", getRendererPlatform());
  const toggleLeftTooltipLabel = toggleLeftShortcutLabel
    ? t("layout.toggleWithShortcut", {
        label: t("layout.toggleLeftSidebar"),
        shortcut: toggleLeftShortcutLabel,
      })
    : t("layout.toggleLeftSidebar");

  const overlayPanel = workspaceUiStore((state) => state.overlayPanel);
  const setOverlayPanel = workspaceUiStore((state) => state.setOverlayPanel);
  const isScheduledJobPanelOpen = overlayPanel === "scheduledJob";
  const isOverviewPanelOpen = overlayPanel === "overview";
  const { setSelectedRepoId, setSelectedWorkspaceId } = useCommands();

  const handleToggleScheduledJobs = useCallback(() => {
    const willOpen = overlayPanel !== "scheduledJob";
    setOverlayPanel(willOpen ? "scheduledJob" : null);
    if (willOpen) {
      setSelectedRepoId("");
      setSelectedWorkspaceId("");
    }
  }, [overlayPanel, setOverlayPanel, setSelectedRepoId, setSelectedWorkspaceId]);

  const handleToggleOverview = useCallback(() => {
    const willOpen = overlayPanel !== "overview";
    setOverlayPanel(willOpen ? "overview" : null);
    if (willOpen) {
      setSelectedRepoId("");
      setSelectedWorkspaceId("");
    }
  }, [overlayPanel, setOverlayPanel, setSelectedRepoId, setSelectedWorkspaceId]);

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
      <PaneHeader py={0.75}>
        <Box
          className="electron-webkit-app-region-no-drag"
          sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", minWidth: 0, pr: 0.5 }}
        />
        <Stack direction="row" alignItems="center" spacing={0.25}>
          <PaneToggleButton
            tooltipLabel={toggleLeftTooltipLabel}
            ariaLabel={t("layout.toggleLeftSidebar")}
            icon={<LuPanelLeft size={16} />}
            onClick={onToggleLeftPane}
          />
        </Stack>
      </PaneHeader>
      <Button
        variant="text"
        startIcon={<LuChartBar size={14} />}
        onClick={handleToggleOverview}
        aria-label="Overview"
        aria-pressed={isOverviewPanelOpen}
        sx={{
          justifyContent: "flex-start",
          textTransform: "none",
          color: isOverviewPanelOpen ? "primary.main" : "text.secondary",
          bgcolor: isOverviewPanelOpen ? "action.selected" : "transparent",
          borderRadius: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 2,
          py: 0.875,
          flexShrink: 0,
          ":hover": {
            bgcolor: isOverviewPanelOpen ? "action.selected" : "action.hover",
          },
        }}
      >
        Overview
      </Button>
      <Button
        variant="text"
        startIcon={<LuZap size={14} />}
        onClick={handleToggleScheduledJobs}
        aria-label={t("scheduledJob.title")}
        aria-pressed={isScheduledJobPanelOpen}
        sx={{
          justifyContent: "flex-start",
          textTransform: "none",
          color: isScheduledJobPanelOpen ? "primary.main" : "text.secondary",
          bgcolor: isScheduledJobPanelOpen ? "action.selected" : "transparent",
          borderRadius: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 2,
          py: 0.875,
          flexShrink: 0,
          ":hover": {
            bgcolor: isScheduledJobPanelOpen ? "action.selected" : "action.hover",
          },
        }}
      >
        {t("scheduledJob.title")}
      </Button>
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          pb: 0.75,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: "text.disabled",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {t("project.list.workspaces")}
        </Typography>
        <Box className="electron-webkit-app-region-no-drag" sx={{ display: "flex", alignItems: "center" }}>
          <ProjectFilterPopoverView />
        </Box>
      </Box>
      <ProjectListView />
      {!isProjectsLoaded ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={20} />
        </Box>
      ) : filteredRepos.length === 0 ? (
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
