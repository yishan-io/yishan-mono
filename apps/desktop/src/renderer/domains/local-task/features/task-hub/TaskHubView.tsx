import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Pagination,
  type PaginationProps,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { type WorkspaceProjectRecord, projectStore } from "@renderer/domains/project";
import { PaneHeader, PaneToggleButton, useWorkspacePaneVisibilityContext } from "@renderer/domains/workbench";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowLeft, LuListFilter, LuListTodo, LuPanelLeft, LuPlus, LuRefreshCw, LuSearch } from "react-icons/lu";
import {
  loadLocalTaskTagSuggestions,
  refreshLocalTaskHub,
  setLocalTaskHubSearchQuery,
} from "../../commands/localTaskCommands";
import { localTaskStore } from "../../state/localTaskStore";
import { CreateLocalTaskDialog } from "./CreateLocalTaskDialog";
import { LocalTaskHubFilterChips } from "./LocalTaskHubFilterChips";
import { LocalTaskHubFilterMenu } from "./LocalTaskHubFilterMenu";
import { LocalTaskList } from "./LocalTaskList";
import { TaskHubTaskDetails } from "./TaskHubTaskDetails";
import { useTaskHubDetailProjection } from "./useTaskHubDetailProjection";

const TASK_HUB_PAGE_SIZE = 20;

type TaskHubProjectFilterOption = Pick<WorkspaceProjectRecord, "id" | "name" | "icon">;

/** Merges the renderer catalog with all daemon-resolved Hub project displays by stable project ID. */
export function getTaskHubProjectFilterOptions(
  projects: WorkspaceProjectRecord[],
  projectDisplayById: Record<string, TaskHubProjectFilterOption>,
): TaskHubProjectFilterOption[] {
  const projectsById = new Map(
    projects.map((project) => [
      project.id,
      project.icon
        ? { id: project.id, name: project.name, icon: project.icon }
        : { id: project.id, name: project.name },
    ]),
  );
  for (const project of Object.values(projectDisplayById)) {
    projectsById.set(
      project.id,
      project.icon
        ? { id: project.id, name: project.name, icon: project.icon }
        : { id: project.id, name: project.name },
    );
  }
  return [...projectsById.values()].sort((firstProject, secondProject) =>
    firstProject.name.localeCompare(secondProject.name),
  );
}

/** Renders the global Local Task Hub with creation, search, filters, and list states. */
export function TaskHubView() {
  const { t } = useTranslation();
  const { leftCollapsed, onToggleLeftPane } = useWorkspacePaneVisibilityContext();
  const tasks = localTaskStore((state) => state.hubTasks);
  const filters = localTaskStore((state) => state.hubFilters);
  const searchQuery = localTaskStore((state) => state.hubSearchQuery);
  const loadState = localTaskStore((state) => state.hubLoadState);
  const error = localTaskStore((state) => state.hubError);
  const taskById = localTaskStore((state) => state.taskById);
  const projectDisplayById = localTaskStore((state) => state.hubProjectDisplayById);
  const projects = projectStore((state) => state.projects);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const previousHubQueryRef = useRef({ filters, searchQuery });
  const pageCount = Math.ceil(tasks.length / TASK_HUB_PAGE_SIZE);
  const resolvedCurrentPage = Math.min(currentPage, Math.max(pageCount, 1));
  const paginatedTasks = useMemo(() => {
    const firstTaskIndex = (resolvedCurrentPage - 1) * TASK_HUB_PAGE_SIZE;
    return tasks.slice(firstTaskIndex, firstTaskIndex + TASK_HUB_PAGE_SIZE);
  }, [resolvedCurrentPage, tasks]);
  const selectedTask = selectedTaskId
    ? (taskById[selectedTaskId] ?? tasks.find((task) => task.id === selectedTaskId))
    : undefined;
  const detailProjection = useTaskHubDetailProjection(selectedTask);
  const filterProjects = useMemo(
    () => getTaskHubProjectFilterOptions(projects, projectDisplayById),
    [projectDisplayById, projects],
  );

  useEffect(() => {
    // fire-and-forget: Local Task store owns loading and error state.
    void refreshLocalTaskHub();
    void loadLocalTaskTagSuggestions();
  }, []);

  useEffect(() => {
    if (previousHubQueryRef.current.filters === filters && previousHubQueryRef.current.searchQuery === searchQuery)
      return;
    previousHubQueryRef.current = { filters, searchQuery };
    setCurrentPage(1);
  }, [filters, searchQuery]);

  useEffect(() => {
    setCurrentPage(resolvedCurrentPage);
  }, [resolvedCurrentPage]);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    void setLocalTaskHubSearchQuery(event.target.value);
  }, []);
  const handleRetry = useCallback(() => void refreshLocalTaskHub(), []);
  const handleOpenFilterMenu = useCallback((anchor: HTMLElement) => setFilterMenuAnchor(anchor), []);
  const handleCloseFilterMenu = useCallback(() => setFilterMenuAnchor(null), []);
  const handleOpenCreate = useCallback(() => setIsCreateOpen(true), []);
  const handleCloseCreate = useCallback(() => setIsCreateOpen(false), []);
  const handleSelectTask = useCallback((taskId: string) => setSelectedTaskId(taskId), []);
  const handlePageChange = useCallback((_event: React.ChangeEvent<unknown>, page: number) => setCurrentPage(page), []);
  const getPaginationItemAriaLabel = useCallback<NonNullable<PaginationProps["getItemAriaLabel"]>>(
    (type, page, selected) => {
      if (type === "previous") return t("localTask.pagination.previous");
      if (type === "next") return t("localTask.pagination.next");
      return t(selected ? "localTask.pagination.selectedPage" : "localTask.pagination.page", { page });
    },
    [t],
  );
  const handleBackToList = useCallback(() => setSelectedTaskId(null), []);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <PaneHeader>
        <Box data-testid="local-task-hub-title" sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
          {leftCollapsed ? (
            <PaneToggleButton
              tooltipLabel={t("layout.toggleLeftSidebar")}
              ariaLabel={t("layout.toggleLeftSidebar")}
              icon={<LuPanelLeft size={16} />}
              onClick={onToggleLeftPane}
            />
          ) : null}
          {selectedTask ? (
            <Box className="electron-webkit-app-region-no-drag" sx={{ display: "inline-flex" }}>
              <Tooltip title={t("common.actions.back")}>
                <IconButton size="small" aria-label={t("common.actions.back")} onClick={handleBackToList}>
                  <LuArrowLeft size={17} />
                </IconButton>
              </Tooltip>
            </Box>
          ) : (
            <LuListTodo size={17} />
          )}
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
            {selectedTask?.title ?? t("localTask.title")}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box className="electron-webkit-app-region-no-drag" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {selectedTask ? null : (
            <Button size="small" variant="text" color="inherit" startIcon={<LuPlus />} onClick={handleOpenCreate}>
              {t("localTask.actions.create")}
            </Button>
          )}
        </Box>
      </PaneHeader>
      {selectedTask ? (
        <TaskHubTaskDetails task={selectedTask} detailProjection={detailProjection} />
      ) : (
        <>
          <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <TextField
                size="small"
                placeholder={t("localTask.search.label")}
                value={searchQuery}
                onChange={handleSearchChange}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <LuSearch size={16} />
                      </InputAdornment>
                    ),
                  },
                  htmlInput: { "aria-label": t("localTask.search.label") },
                }}
                sx={{
                  minWidth: 0,
                  flex: 1,
                  "& .MuiInputBase-root": { minHeight: 32 },
                  "& .MuiInputBase-input": { py: 0.5, fontSize: "0.8125rem" },
                }}
              />
              <Tooltip title={t("localTask.actions.filter")}>
                <IconButton
                  size="small"
                  color={filterMenuAnchor ? "primary" : "default"}
                  aria-label={t("localTask.actions.filter")}
                  aria-expanded={Boolean(filterMenuAnchor)}
                  aria-controls="local-task-hub-filter-menu"
                  onClick={(event) => handleOpenFilterMenu(event.currentTarget)}
                >
                  <LuListFilter size={17} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("localTask.actions.refresh")}>
                <IconButton size="small" aria-label={t("localTask.actions.refresh")} onClick={handleRetry}>
                  <LuRefreshCw size={17} />
                </IconButton>
              </Tooltip>
            </Box>
            <LocalTaskHubFilterChips
              filters={filters}
              projects={filterProjects}
              tagCatalog={detailProjection.tagCatalog}
            />
            <LocalTaskHubFilterMenu
              anchorEl={filterMenuAnchor}
              filters={filters}
              projects={filterProjects}
              tagCatalog={detailProjection.tagCatalog}
              onClose={handleCloseFilterMenu}
            />
          </Box>
          {detailProjection.mutationError ? (
            <Alert severity="error" sx={{ mx: 2, mb: 1 }}>
              {detailProjection.mutationError}
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
            <>
              <LocalTaskList
                tasks={paginatedTasks}
                onSelect={handleSelectTask}
                projectDisplayById={projectDisplayById}
                tagCatalog={detailProjection.tagCatalog}
              />
              {pageCount > 1 ? (
                <Box sx={{ display: "flex", justifyContent: "center", p: 1 }}>
                  <Pagination
                    count={pageCount}
                    page={resolvedCurrentPage}
                    aria-label={t("localTask.pagination.label")}
                    getItemAriaLabel={getPaginationItemAriaLabel}
                    onChange={handlePageChange}
                  />
                </Box>
              ) : null}
            </>
          )}
        </>
      )}
      <CreateLocalTaskDialog open={isCreateOpen} onClose={handleCloseCreate} />
    </Box>
  );
}
