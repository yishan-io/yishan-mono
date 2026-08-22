import { Alert, Box, Button, CircularProgress, Divider, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuLink, LuPlus, LuRefreshCw } from "react-icons/lu";
import {
  loadLocalTask,
  loadLocalTaskContext,
  refreshSelectedWorkspaceTasks,
  selectWorkspaceLocalTask,
} from "../../commands/localTaskCommands";
import { localTaskStore } from "../../state/localTaskStore";
import { CreateLocalTaskDialog } from "../task-hub/CreateLocalTaskDialog";
import { LinkLocalTaskDialog } from "./LinkLocalTaskDialog";
import { VirtualizedWorkspaceTaskLinks } from "./VirtualizedWorkspaceTaskLinks";
import { WorkspaceTaskDetails } from "./WorkspaceTaskDetails";
import { WorkspaceTaskLinkRow } from "./WorkspaceTaskLinkRow";

type WorkspaceTasksViewProps = { workspaceId: string };

/** Renders the selected workspace's primary task, relationship history, selected details, and context documents. */
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
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const primaryLink = links.find((link) => link.role === "primary" && link.status === "active" && !link.unlinkedAt);
  const selectedTask = selectedTaskId ? taskById[selectedTaskId] : undefined;

  useEffect(() => {
    const taskLoadState = selectedTaskId ? taskLoadStateByTaskId[selectedTaskId] : undefined;
    if (selectedTaskId && !taskById[selectedTaskId] && (!taskLoadState || taskLoadState === "idle")) {
      void loadLocalTask(selectedTaskId).catch((loadError) =>
        console.error("Failed to load Local Task details", loadError),
      );
    }
  }, [selectedTaskId, taskById, taskLoadStateByTaskId]);
  useEffect(() => {
    const contextLoadState = selectedTask ? contextLoadStateByTaskId[selectedTask.id] : undefined;
    if (selectedTask && !contextByTaskId[selectedTask.id] && (!contextLoadState || contextLoadState === "idle")) {
      void loadLocalTaskContext(selectedTask.id);
    }
  }, [contextByTaskId, contextLoadStateByTaskId, selectedTask]);

  const relatedLinks = useMemo(() => links.filter((link) => link.id !== primaryLink?.id), [links, primaryLink?.id]);
  const handleRetry = useCallback(() => void refreshSelectedWorkspaceTasks(workspaceId), [workspaceId]);
  const handleOpenLink = useCallback(() => setIsLinkOpen(true), []);
  const handleSelectTask = useCallback((taskId: string) => selectWorkspaceLocalTask(taskId), []);
  const handleRetryTask = useCallback(() => {
    if (selectedTaskId) {
      void loadLocalTask(selectedTaskId).catch((loadError) =>
        console.error("Failed to retry Local Task details", loadError),
      );
    }
  }, [selectedTaskId]);

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
      <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700 }}>
          {t("localTask.workspace.title")}
        </Typography>
        <Button size="small" disabled={isMutationLoading} startIcon={<LuRefreshCw />} onClick={handleRetry}>
          {t("localTask.actions.refresh")}
        </Button>
        <Button size="small" disabled={isMutationLoading} startIcon={<LuPlus />} onClick={() => setIsCreateOpen(true)}>
          {t("localTask.actions.createLocal")}
        </Button>
        <Button size="small" disabled={isMutationLoading} startIcon={<LuLink />} onClick={handleOpenLink}>
          {t("localTask.actions.link")}
        </Button>
      </Box>
      <Typography variant="overline">{t("localTask.workspace.primary")}</Typography>
      {primaryLink ? (
        <WorkspaceTaskLinkRow
          link={primaryLink}
          task={taskById[primaryLink.localTaskId]}
          selected={selectedTaskId === primaryLink.localTaskId}
          isMutationLoading={isMutationLoading}
          onSelect={handleSelectTask}
        />
      ) : (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          {t("localTask.workspace.noPrimary")}
        </Typography>
      )}
      <Divider sx={{ my: 2 }} />
      <Typography variant="overline">{t("localTask.workspace.relatedHistory")}</Typography>
      {relatedLinks.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t("localTask.workspace.noLinks")}
        </Typography>
      ) : (
        <VirtualizedWorkspaceTaskLinks
          links={relatedLinks}
          taskById={taskById}
          selectedTaskId={selectedTaskId}
          isMutationLoading={isMutationLoading}
          onSelect={handleSelectTask}
        />
      )}
      <Divider sx={{ my: 2 }} />
      <Typography variant="overline">{t("localTask.workspace.details")}</Typography>
      {selectedTask ? (
        <WorkspaceTaskDetails
          task={selectedTask}
          contextLoadState={contextLoadStateByTaskId[selectedTask.id] ?? "idle"}
          contextError={contextErrorByTaskId[selectedTask.id] ?? null}
          contextAvailable={Boolean(contextByTaskId[selectedTask.id])}
          isMutationLoading={isMutationLoading}
        />
      ) : selectedTaskId && taskLoadStateByTaskId[selectedTaskId] === "error" ? (
        <Alert severity="error" action={<Button onClick={handleRetryTask}>{t("localTask.actions.retry")}</Button>}>
          {taskErrorByTaskId[selectedTaskId]}
        </Alert>
      ) : selectedTaskId && taskLoadStateByTaskId[selectedTaskId] === "loading" ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <CircularProgress size={24} aria-label={t("localTask.states.loading")} />
        </Box>
      ) : (
        <Typography color="text.secondary">{t("localTask.workspace.selectTask")}</Typography>
      )}
      <LinkLocalTaskDialog open={isLinkOpen} workspaceId={workspaceId} onClose={() => setIsLinkOpen(false)} />
      <CreateLocalTaskDialog
        open={isCreateOpen}
        workspaceId={workspaceId}
        defaultLinkRole={primaryLink ? "related" : "primary"}
        onClose={() => setIsCreateOpen(false)}
      />
    </Box>
  );
}
