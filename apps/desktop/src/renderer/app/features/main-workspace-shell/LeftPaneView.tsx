import { Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";

import { localTaskStore } from "@renderer/domains/local-task";
import { projectStore } from "@renderer/domains/project";
import {
  activateProject,
  activateWorkspace,
  toggleTaskHubOverlay,
  workbenchNavigationStore,
} from "@renderer/domains/workbench";
import { PaneHeader } from "@renderer/domains/workbench";
import { PaneToggleButton } from "@renderer/domains/workbench";
import { getRendererPlatform } from "@renderer/platform/platform";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChartBar, LuClock3, LuListTodo, LuPanelLeft, LuPlus, LuRefreshCw } from "react-icons/lu";
import { loadWorkspaceSnapshot } from "../../../app/commands/workspaceSnapshotFlow";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { AppMenuView } from "../app-menu/AppMenuView";
import { ProjectFilterPopoverView } from "../project-workspace-navigator/ProjectFilterPopoverView";
import { WorkspaceNavigatorView } from "../project-workspace-navigator/WorkspaceNavigatorView";

type LeftPaneViewProps = {
  onCreateRepository?: () => void;
  onToggleLeftPane?: () => void;
};

/** Renders repo/workspace navigation and top-level left pane chrome. */
export function LeftPaneView({ onCreateRepository, onToggleLeftPane }: LeftPaneViewProps = {}) {
  const { t } = useTranslation();
  const repos = projectStore((state) => state.projects);
  const displayRepoIds = projectStore((state) => state.displayProjectIds) ?? [];
  const isProjectsLoaded = projectStore((state) => state.isProjectsLoaded);
  const filteredRepos = repos.filter((repo) => displayRepoIds.includes(repo.id));
  const toggleLeftShortcutLabel = getShortcutDisplayLabelById("toggle-left-pane", getRendererPlatform());
  const toggleLeftTooltipLabel = toggleLeftShortcutLabel
    ? t("layout.toggleWithShortcut", {
        label: t("layout.toggleLeftSidebar"),
        shortcut: toggleLeftShortcutLabel,
      })
    : t("layout.toggleLeftSidebar");

  const overlayPanel = workbenchNavigationStore((state) => state.overlayPanel);
  const setOverlayPanel = workbenchNavigationStore((state) => state.setOverlayPanel);
  const isScheduledJobPanelOpen = overlayPanel === "scheduledJob";
  const isOverviewPanelOpen = overlayPanel === "overview";
  const isTasksPanelOpen = overlayPanel === "tasks";
  const progressingTaskCount = localTaskStore((state) => state.progressingTaskCount);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshProjects = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadWorkspaceSnapshot();
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleToggleScheduledJobs = useCallback(() => {
    const willOpen = overlayPanel !== "scheduledJob";
    setOverlayPanel(willOpen ? "scheduledJob" : null);
    if (willOpen) {
      activateProject({ projectId: "", workspaceId: "" });
      activateWorkspace({ workspaceId: "" });
    }
  }, [overlayPanel, setOverlayPanel]);

  const handleToggleOverview = useCallback(() => {
    const willOpen = overlayPanel !== "overview";
    setOverlayPanel(willOpen ? "overview" : null);
    if (willOpen) {
      activateProject({ projectId: "", workspaceId: "" });
      activateWorkspace({ workspaceId: "" });
    }
  }, [overlayPanel, setOverlayPanel]);

  const handleToggleTasks = useCallback(() => {
    toggleTaskHubOverlay();
  }, []);

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
        <Stack
          direction="row"
          spacing={0.25}
          sx={{
            alignItems: "center",
          }}
        >
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
        aria-label={t("overview.title")}
        aria-pressed={isOverviewPanelOpen}
        sx={{
          justifyContent: "flex-start",

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
        {t("overview.title")}
      </Button>
      <Button
        variant="text"
        startIcon={<LuListTodo size={14} />}
        onClick={handleToggleTasks}
        aria-label={t("localTask.progressingCount", { count: progressingTaskCount })}
        aria-pressed={isTasksPanelOpen}
        sx={{
          justifyContent: "flex-start",
          color: isTasksPanelOpen ? "primary.main" : "text.secondary",
          bgcolor: isTasksPanelOpen ? "action.selected" : "transparent",
          borderRadius: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 2,
          py: 0.875,
          flexShrink: 0,
          ":hover": { bgcolor: isTasksPanelOpen ? "action.selected" : "action.hover" },
        }}
      >
        {t("localTask.title")}
        {progressingTaskCount > 0 ? (
          <Box
            component="span"
            data-testid="local-task-active-count"
            sx={{
              ml: "auto",
              minWidth: 20,
              px: 0.75,
              borderRadius: 10,
              bgcolor: "action.selected",
              color: "text.secondary",
              fontSize: "0.7rem",
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            {progressingTaskCount > 99 ? "99+" : progressingTaskCount}
          </Box>
        ) : null}
      </Button>
      <Button
        variant="text"
        startIcon={<LuClock3 size={14} />}
        onClick={handleToggleScheduledJobs}
        aria-label={t("scheduledJob.title")}
        aria-pressed={isScheduledJobPanelOpen}
        sx={{
          justifyContent: "flex-start",

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
          <Tooltip title={t("project.actions.refresh")}>
            <IconButton
              aria-label={t("project.actions.refresh")}
              onClick={handleRefreshProjects}
              disabled={isRefreshing}
              sx={{
                "@keyframes project-refresh-spin": {
                  from: { transform: "rotate(0deg)" },
                  to: { transform: "rotate(360deg)" },
                },
                ...(isRefreshing && { "& svg": { animation: "project-refresh-spin 1s linear infinite" } }),
              }}
            >
              <LuRefreshCw size={13} />
            </IconButton>
          </Tooltip>
          <ProjectFilterPopoverView />
        </Box>
      </Box>
      <WorkspaceNavigatorView />
      {!isProjectsLoaded ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={20} />
        </Box>
      ) : filteredRepos.length === 0 ? (
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
            }}
          >
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
