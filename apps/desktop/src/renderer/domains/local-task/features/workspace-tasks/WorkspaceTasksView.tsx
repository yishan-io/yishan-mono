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
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuEllipsis, LuLink, LuPlus, LuRefreshCw } from "react-icons/lu";
import {
  loadLocalTask,
  loadLocalTaskContext,
  loadLocalTaskTagSuggestions,
  openLocalTaskContextInFileTree,
  refreshSelectedWorkspaceTasks,
  selectWorkspaceLocalTask,
  updateLocalTask,
  updateLocalTaskTagColor,
} from "../../commands/localTaskCommands";
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
  const tagSuggestions = localTaskStore((state) => state.tagSuggestions);
  const tagCatalog = localTaskStore((state) => state.tagCatalog);
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
    if (detailTaskId && loadState === "loaded" && !links.some((link) => link.localTaskId === detailTaskId)) {
      setDetailNavigation(null);
    }
  }, [detailTaskId, links, loadState]);
  useEffect(() => {
    const taskLoadState = detailTaskId ? taskLoadStateByTaskId[detailTaskId] : undefined;
    if (detailTaskId && !taskById[detailTaskId] && (!taskLoadState || taskLoadState === "idle")) {
      void loadLocalTask(detailTaskId).catch((loadError) =>
        console.error("Failed to load Local Task details", loadError),
      );
    }
  }, [detailTaskId, taskById, taskLoadStateByTaskId]);
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
    (status: "active" | "paused" | "completed") => {
      if (detailTaskId) {
        void updateLocalTask(detailTaskId, { status }).catch((statusError) =>
          console.error("Failed to update Local Task status", statusError),
        );
      }
    },
    [detailTaskId],
  );
  const handleToggleDetailStatus = useCallback(() => {
    if (selectedTask) handleDetailStatus(selectedTask.status === "active" ? "paused" : "active");
  }, [handleDetailStatus, selectedTask]);
  const handleCompleteDetail = useCallback(() => handleDetailStatus("completed"), [handleDetailStatus]);
  const handleOpenContextFolder = useCallback(() => {
    if (!selectedTask) return;
    if (contextByTaskId[selectedTask.id]) {
      openLocalTaskContextInFileTree(selectedTask.id);
      return;
    }
    void loadLocalTaskContext(selectedTask.id);
  }, [contextByTaskId, selectedTask]);
  const handleRetryTask = useCallback(() => {
    if (detailTaskId) {
      void loadLocalTask(detailTaskId).catch((loadError) =>
        console.error("Failed to retry Local Task details", loadError),
      );
    }
  }, [detailTaskId]);

  if (loadState === "loading" || loadState === "idle") {
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
            isContextLoading={selectedTask ? contextLoadStateByTaskId[selectedTask.id] === "loading" : false}
            onBack={handleBack}
            onOpenContextFolder={handleOpenContextFolder}
            onToggleStatus={handleToggleDetailStatus}
            onComplete={handleCompleteDetail}
          />
          {selectedTask ? (
            <WorkspaceTaskDetails
              task={selectedTask}
              contextLoadState={contextLoadStateByTaskId[selectedTask.id] ?? "idle"}
              contextError={contextErrorByTaskId[selectedTask.id] ?? null}
              isMutationLoading={isMutationLoading}
              onTagsChange={(tags) => updateLocalTask(selectedTask.id, { tags })}
              onTagColorChange={updateLocalTaskTagColor}
              tagSuggestions={tagSuggestions}
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
          {links.length > 0 ? (
            <VirtualizedWorkspaceTaskLinks
              links={links}
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
