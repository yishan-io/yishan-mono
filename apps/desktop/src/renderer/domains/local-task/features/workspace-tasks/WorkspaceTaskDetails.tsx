import { Alert, Box, Button, CircularProgress, Divider, Stack, Typography } from "@mui/material";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadLocalTaskContext, openLocalTaskContextDocument, updateLocalTask } from "../../commands/localTaskCommands";
import type { LocalTask, LocalTaskLoadState } from "../../localTaskTypes";

type WorkspaceTaskDetailsProps = {
  task: LocalTask;
  contextLoadState: LocalTaskLoadState;
  contextError: string | null;
  contextAvailable: boolean;
  isMutationLoading: boolean;
};

/** Renders metadata, lifecycle actions, and Task Context controls for the selected workspace task. */
export function WorkspaceTaskDetails({
  task,
  contextLoadState,
  contextError,
  contextAvailable,
  isMutationLoading,
}: WorkspaceTaskDetailsProps) {
  const { t } = useTranslation();
  const [openFailure, setOpenFailure] = useState<{
    taskId: string;
    document: "plan" | "notes" | "outcome";
    message: string;
  } | null>(null);
  const setStatus = useCallback(
    (status: LocalTask["status"]) => {
      void updateLocalTask(task.id, { status }).catch((error) =>
        console.error("Failed to update Local Task status", error),
      );
    },
    [task.id],
  );
  const handleRetryContext = useCallback(() => void loadLocalTaskContext(task.id), [task.id]);
  const openDocument = useCallback(
    async (document: "plan" | "notes" | "outcome") => {
      setOpenFailure(null);
      try {
        await openLocalTaskContextDocument(task.id, document);
      } catch (error) {
        setOpenFailure({ taskId: task.id, document, message: getErrorMessage(error) });
      }
    },
    [task.id],
  );
  const visibleOpenFailure = openFailure?.taskId === task.id ? openFailure : null;
  const retryOpenDocument = useCallback(() => {
    if (visibleOpenFailure) void openDocument(visibleOpenFailure.document);
  }, [openDocument, visibleOpenFailure]);

  return (
    <Stack spacing={1}>
      <Typography sx={{ fontWeight: 700 }}>{task.title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {task.description || t("localTask.states.noDescription")}
      </Typography>
      <Typography variant="body2">
        {t("localTask.fields.status")}: {t(`localTask.status.${task.status}`)}
      </Typography>
      <Typography variant="body2">
        {t("localTask.fields.priority")}: {t(`localTask.priority.${task.priority}`)}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        {task.status === "active" ? (
          <Button size="small" disabled={isMutationLoading} onClick={() => setStatus("paused")}>
            {t("localTask.actions.pauseTask")}
          </Button>
        ) : (
          <Button size="small" disabled={isMutationLoading} onClick={() => setStatus("active")}>
            {t("localTask.actions.reactivateTask")}
          </Button>
        )}
        {task.status !== "completed" ? (
          <Button size="small" disabled={isMutationLoading} onClick={() => setStatus("completed")}>
            {t("localTask.actions.completeTask")}
          </Button>
        ) : null}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {task.id}
      </Typography>
      <Divider />
      <Typography variant="overline">{t("localTask.context.title")}</Typography>
      {contextLoadState === "loading" || contextLoadState === "idle" ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CircularProgress size={16} aria-label={t("localTask.context.loading")} />
          <Typography variant="body2" color="text.secondary">
            {t("localTask.context.loading")}
          </Typography>
        </Box>
      ) : contextLoadState === "error" ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={handleRetryContext}>
              {t("localTask.actions.retry")}
            </Button>
          }
        >
          {contextError}
        </Alert>
      ) : null}
      {visibleOpenFailure ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={retryOpenDocument}>
              {t("localTask.actions.retry")}
            </Button>
          }
        >
          {visibleOpenFailure.message}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        {(["plan", "notes", "outcome"] as const).map((document) => (
          <Button
            key={document}
            size="small"
            disabled={!contextAvailable || contextLoadState !== "loaded"}
            onClick={() => void openDocument(document)}
          >
            {document}.md
          </Button>
        ))}
      </Box>
    </Stack>
  );
}
