import { Alert, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { projectStore } from "@renderer/domains/project";
import { PaneHeader, PaneToggleButton, useWorkspacePaneVisibilityContext } from "@renderer/domains/workbench";
import { workspaceStore } from "@renderer/domains/workspace";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuListTodo, LuPanelLeft, LuPlus, LuRefreshCw } from "react-icons/lu";
import { refreshLocalTaskHub, setLocalTaskHubSearchQuery } from "../../commands/localTaskCommands";
import { localTaskStore } from "../../state/localTaskStore";
import { CreateLocalTaskDialog } from "./CreateLocalTaskDialog";
import { LocalTaskHubFilters } from "./LocalTaskHubFilters";
import { LocalTaskList } from "./LocalTaskList";

type TaskHubViewProps = {
  onClose?: () => void;
};

/** Renders the global Local Task Hub with creation, search, filters, and list states. */
export function TaskHubView({ onClose }: TaskHubViewProps = {}) {
  const { t } = useTranslation();
  const { leftCollapsed, onToggleLeftPane } = useWorkspacePaneVisibilityContext();
  const tasks = localTaskStore((state) => state.hubTasks);
  const filters = localTaskStore((state) => state.hubFilters);
  const searchQuery = localTaskStore((state) => state.hubSearchQuery);
  const loadState = localTaskStore((state) => state.hubLoadState);
  const error = localTaskStore((state) => state.hubError);
  const mutationError = localTaskStore((state) => state.mutationError);
  const projects = projectStore((state) => state.projects);
  const workspaces = workspaceStore((state) => state.workspaces);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    // fire-and-forget: Local Task store owns loading and error state.
    void refreshLocalTaskHub();
  }, []);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    void setLocalTaskHubSearchQuery(event.target.value);
  }, []);
  const handleRetry = useCallback(() => void refreshLocalTaskHub(), []);
  const handleOpenCreate = useCallback(() => setIsCreateOpen(true), []);
  const handleCloseCreate = useCallback(() => setIsCreateOpen(false), []);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <PaneHeader>
        {leftCollapsed ? (
          <PaneToggleButton
            tooltipLabel={t("layout.toggleLeftSidebar")}
            ariaLabel={t("layout.toggleLeftSidebar")}
            icon={<LuPanelLeft size={16} />}
            onClick={onToggleLeftPane}
          />
        ) : null}
        <LuListTodo size={17} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {t("localTask.title")}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<LuRefreshCw />} onClick={handleRetry}>
          {t("localTask.actions.refresh")}
        </Button>
        <Button size="small" variant="contained" startIcon={<LuPlus />} onClick={handleOpenCreate}>
          {t("localTask.actions.create")}
        </Button>
        {onClose ? (
          <Button size="small" onClick={onClose}>
            {t("common.actions.close")}
          </Button>
        ) : null}
      </PaneHeader>
      <Box sx={{ p: 2, display: "flex", flexWrap: "wrap", gap: 1 }}>
        <TextField
          size="small"
          label={t("localTask.search.label")}
          value={searchQuery}
          onChange={handleSearchChange}
          sx={{ minWidth: 240, flex: 1 }}
        />
        <LocalTaskHubFilters filters={filters} projects={projects} workspaces={workspaces} />
      </Box>
      {mutationError ? (
        <Alert severity="error" sx={{ mx: 2, mb: 1 }}>
          {mutationError}
        </Alert>
      ) : null}
      {loadState === "loading" || loadState === "idle" ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CircularProgress aria-label={t("localTask.states.loading")} />
        </Box>
      ) : loadState === "error" ? (
        <Box sx={{ p: 3 }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={handleRetry}>
                {t("localTask.actions.retry")}
              </Button>
            }
          >
            {error}
          </Alert>
        </Box>
      ) : tasks.length === 0 ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography color="text.secondary">{t("localTask.states.empty")}</Typography>
        </Box>
      ) : (
        <LocalTaskList tasks={tasks} />
      )}
      <CreateLocalTaskDialog open={isCreateOpen} onClose={handleCloseCreate} />
    </Box>
  );
}
