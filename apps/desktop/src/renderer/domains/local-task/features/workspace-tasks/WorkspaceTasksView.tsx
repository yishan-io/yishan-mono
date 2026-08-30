import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuEllipsis, LuLink, LuPlus, LuRefreshCw } from "react-icons/lu";
import {
  createLocalTaskTag,
  loadLocalTask,
  loadLocalTaskContext,
  loadLocalTaskDetails,
  loadLocalTaskTagSuggestions,
  navigateToLocalTaskProject,
  navigateToLocalTaskWorkspace,
  openLocalTaskContextFile,
  refreshSelectedWorkspaceTasks,
  selectWorkspaceLocalTask,
  updateLocalTask,
} from "../../commands/localTaskCommands";
import type { LocalTaskContextFileName, LocalTaskStatus } from "../../localTaskTypes";
import { localTaskStore } from "../../state/localTaskStore";
import { CreateLocalTaskDialog } from "../task-hub/CreateLocalTaskDialog";
import { LinkLocalTaskDialog } from "./LinkLocalTaskDialog";
import { VirtualizedWorkspaceTaskLinks } from "./VirtualizedWorkspaceTaskLinks";
import { WorkspaceTaskDetailHeader } from "./WorkspaceTaskDetailHeader";
import { WorkspaceTaskDetails } from "./WorkspaceTaskDetails";

type WorkspaceTasksViewProps = { workspaceId: string };

/** Renders workspace task navigation and the dedicated details pane. */
export function WorkspaceTasksView({ workspaceId }: WorkspaceTasksViewProps) {
  const { t } = useTranslation();
  const links = localTaskStore((state) => state.workspaceLinks);
  const workspaceTasks = localTaskStore((state) => state.workspaceTasks);
  const taskById = localTaskStore((state) => state.taskById);
  const selectedTaskId = localTaskStore((state) => state.selectedWorkspaceTaskId);
  const loadState = localTaskStore((state) => state.workspaceLoadState);
  const error = localTaskStore((state) => state.workspaceError);
  const mutationError = localTaskStore((state) => state.mutationError);
  const isMutationLoading = localTaskStore((state) => state.isMutationLoading);
  const taskLoadStateByTaskId = localTaskStore((state) => state.taskLoadStateByTaskId);
  const taskErrorByTaskId = localTaskStore((state) => state.taskErrorByTaskId);
  const contextByTaskId = localTaskStore((state) => state.contextByTaskId);
  const contextLoadStateByTaskId = localTaskStore((state) => state.contextLoadStateByTaskId);
  const contextErrorByTaskId = localTaskStore((state) => state.contextErrorByTaskId);
  const tagCatalog = localTaskStore((state) => state.tagCatalog);
  const detailsByTaskId = localTaskStore((state) => state.detailsByTaskId);
  const detailsLoadStateByTaskId = localTaskStore((state) => state.detailsLoadStateByTaskId);
  const detailsErrorByTaskId = localTaskStore((state) => state.detailsErrorByTaskId);
  const linkedLinks = useMemo(() => links.filter((link) => link.unlinkedAt === null), [links]);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<HTMLElement | null>(null);
  const [detailNavigation, setDetailNavigation] = useState<{ workspaceId: string; taskId: string } | null>(null);
  const detailTaskId = detailNavigation?.workspaceId === workspaceId ? detailNavigation.taskId : null;
  const selectedTask = detailTaskId ? taskById[detailTaskId] : undefined;

  useEffect(() => {
    void loadLocalTaskTagSuggestions();
  }, []);
  useEffect(() => {
    setDetailNavigation((currentNavigation) =>
      currentNavigation?.workspaceId === workspaceId ? currentNavigation : null,
    );
    setActionMenuAnchor(null);
    setIsLinkOpen(false);
    setIsCreateOpen(false);
  }, [workspaceId]);
  useEffect(() => {
    if (detailTaskId && loadState === "loaded" && !linkedLinks.some((link) => link.localTaskId === detailTaskId)) {
      setDetailNavigation(null);
    }
  }, [detailTaskId, linkedLinks, loadState]);
  useEffect(() => {
    const taskLoadState = detailTaskId ? taskLoadStateByTaskId[detailTaskId] : undefined;
    if (detailTaskId && !taskById[detailTaskId] && (!taskLoadState || taskLoadState === "idle")) {
      void loadLocalTask(detailTaskId).catch((loadError) =>
        console.error("Failed to load Local Task details", loadError),
      );
    }
  }, [detailTaskId, taskById, taskLoadStateByTaskId]);
  useEffect(() => {
    const detailsLoadState = selectedTask ? detailsLoadStateByTaskId[selectedTask.id] : undefined;
    if (selectedTask && !detailsByTaskId[selectedTask.id] && (!detailsLoadState || detailsLoadState === "idle")) {
      void loadLocalTaskDetails(selectedTask.id).catch((loadError) =>
        console.error("Failed to load Local Task detail projection", loadError),
      );
    }
  }, [detailsByTaskId, detailsLoadStateByTaskId, selectedTask]);

  useEffect(() => {
    const contextLoadState = selectedTask ? contextLoadStateByTaskId[selectedTask.id] : undefined;
    if (selectedTask && !contextByTaskId[selectedTask.id] && (!contextLoadState || contextLoadState === "idle")) {
      void loadLocalTaskContext(selectedTask.id);
    }
  }, [contextByTaskId, contextLoadStateByTaskId, selectedTask]);

  const handleRetry = useCallback(() => void refreshSelectedWorkspaceTasks(workspaceId), [workspaceId]);
  const handleCloseActionMenu = useCallback(() => setActionMenuAnchor(null), []);
  const handleOpenActionMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setActionMenuAnchor(event.currentTarget);
  }, []);
  const handleCreateAction = useCallback(() => {
    handleCloseActionMenu();
    setIsCreateOpen(true);
  }, [handleCloseActionMenu]);
  const handleOpenLink = useCallback(() => {
    handleCloseActionMenu();
    setIsLinkOpen(true);
  }, [handleCloseActionMenu]);
  const handleSelectTask = useCallback(
    (taskId: string) => {
      selectWorkspaceLocalTask(taskId);
      setDetailNavigation({ workspaceId, taskId });
    },
    [workspaceId],
  );
  const handleBack = useCallback(() => setDetailNavigation(null), []);
  const handleDetailStatus = useCallback(
    (status: LocalTaskStatus) => {
      if (detailTaskId) {
        void updateLocalTask(detailTaskId, { status }).catch((statusError) =>
          console.error("Failed to update Local Task status", statusError),
        );
      }
    },
    [detailTaskId],
  );
  const handleDetailPriority = useCallback(
    (priority: "low" | "medium" | "high") => {
      if (detailTaskId) {
        void updateLocalTask(detailTaskId, { priority }).catch((priorityError) =>
          console.error("Failed to update Local Task priority", priorityError),
        );
      }
    },
    [detailTaskId],
  );
  const handleRetryDetails = useCallback(() => {
    if (selectedTask) {
      void loadLocalTaskDetails(selectedTask.id).catch((loadError) =>
        console.error("Failed to retry Local Task detail projection", loadError),
      );
    }
  }, [selectedTask]);
  const handleRetryTask = useCallback(() => {
    if (detailTaskId) {
      void loadLocalTask(detailTaskId).catch((loadError) =>
        console.error("Failed to retry Local Task details", loadError),
      );
    }
  }, [detailTaskId]);
  const handleContextFileOpen = useCallback(
    (fileName: LocalTaskContextFileName) => {
      if (detailTaskId) openLocalTaskContextFile(workspaceId, detailTaskId, fileName);
    },
    [detailTaskId, workspaceId],
  );

  if (loadState === "idle" || (loadState === "loading" && workspaceTasks.length === 0)) {
    return (
      <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress aria-label={t("localTask.states.loading")} />
      </Box>
    );
  }
  if (loadState === "error") {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" action={<Button onClick={handleRetry}>{t("localTask.actions.retry")}</Button>}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", overflow: "auto", p: 1.5 }}>
      {mutationError ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {mutationError}
        </Alert>
      ) : null}
      {detailTaskId ? (
        <>
          <WorkspaceTaskDetailHeader
            task={selectedTask}
            isMutationLoading={isMutationLoading}
            onBack={handleBack}
            onStatusChange={handleDetailStatus}
            onPriorityChange={handleDetailPriority}
          />
          {selectedTask ? (
            <WorkspaceTaskDetails
              task={selectedTask}
              context={contextByTaskId[selectedTask.id]}
              contextLoadState={contextLoadStateByTaskId[selectedTask.id] ?? "idle"}
              contextError={contextErrorByTaskId[selectedTask.id] ?? null}
              details={detailsByTaskId[selectedTask.id]}
              detailsLoadState={detailsLoadStateByTaskId[selectedTask.id] ?? "idle"}
              detailsError={detailsErrorByTaskId[selectedTask.id] ?? null}
              onRetryDetails={handleRetryDetails}
              showLocationMetadata={false}
              showStatusAndPriority={false}
              showTagsAboveDescription
              layout="stacked"
              isMutationLoading={isMutationLoading}
              onStatusChange={handleDetailStatus}
              onPriorityChange={handleDetailPriority}
              onTagIdsChange={(tagIds) => updateLocalTask(selectedTask.id, { tagIds })}
              onCreateTag={createLocalTaskTag}
              onProjectNavigate={navigateToLocalTaskProject}
              onWorkspaceNavigate={navigateToLocalTaskWorkspace}
              onContextFileOpen={handleContextFileOpen}
              tagCatalog={tagCatalog}
            />
          ) : taskLoadStateByTaskId[detailTaskId] === "error" ? (
            <Alert severity="error" action={<Button onClick={handleRetryTask}>{t("localTask.actions.retry")}</Button>}>
              {taskErrorByTaskId[detailTaskId]}
            </Alert>
          ) : (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} aria-label={t("localTask.states.loading")} />
            </Box>
          )}
        </>
      ) : (
        <>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700 }}>
              {t("localTask.workspace.title")}
            </Typography>
            <Tooltip title={t("localTask.actions.refresh")}>
              <Box component="span">
                <IconButton
                  size="small"
                  disabled={isMutationLoading}
                  aria-label={t("localTask.actions.refresh")}
                  onClick={handleRetry}
                >
                  <LuRefreshCw size={16} />
                </IconButton>
              </Box>
            </Tooltip>
            <Tooltip title={t("localTask.actions.workspaceMenu")}>
              <Box component="span">
                <IconButton
                  size="small"
                  disabled={isMutationLoading}
                  aria-label={t("localTask.actions.workspaceMenu")}
                  onClick={handleOpenActionMenu}
                >
                  <LuEllipsis size={16} />
                </IconButton>
              </Box>
            </Tooltip>
            <Menu anchorEl={actionMenuAnchor} open={Boolean(actionMenuAnchor)} onClose={handleCloseActionMenu}>
              <MenuItem disabled={isMutationLoading} onClick={handleCreateAction}>
                <ListItemIcon>
                  <LuPlus size={15} />
                </ListItemIcon>
                <ListItemText>{t("localTask.actions.createLocal")}</ListItemText>
              </MenuItem>
              <MenuItem disabled={isMutationLoading} onClick={handleOpenLink}>
                <ListItemIcon>
                  <LuLink size={15} />
                </ListItemIcon>
                <ListItemText>{t("localTask.actions.link")}</ListItemText>
              </MenuItem>
            </Menu>
          </Box>
          {linkedLinks.length > 0 ? (
            <VirtualizedWorkspaceTaskLinks
              links={linkedLinks}
              taskById={taskById}
              selectedTaskId={selectedTaskId}
              isMutationLoading={isMutationLoading}
              onSelect={handleSelectTask}
              tagCatalog={tagCatalog}
            />
          ) : (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              {t("localTask.workspace.noLinks")}
            </Typography>
          )}
          <LinkLocalTaskDialog open={isLinkOpen} workspaceId={workspaceId} onClose={() => setIsLinkOpen(false)} />
          <CreateLocalTaskDialog open={isCreateOpen} workspaceId={workspaceId} onClose={() => setIsCreateOpen(false)} />
        </>
      )}
    </Box>
  );
}
