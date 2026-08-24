import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { loadLocalTaskContext } from "../../commands/localTaskCommands";
import type {
  LocalTask,
  LocalTaskContextDetails,
  LocalTaskDetails,
  LocalTaskLoadState,
  LocalTaskPriority,
  LocalTaskStatus,
  LocalTaskTagCatalogEntry,
} from "../../localTaskTypes";
import { TaskDescriptionMarkdown } from "./TaskDescriptionMarkdown";
import { WorkspaceTaskMetadataSidebar } from "./WorkspaceTaskMetadataSidebar";

type WorkspaceTaskDetailsProps = {
  task: LocalTask;
  context?: LocalTaskContextDetails;
  contextLoadState: LocalTaskLoadState;
  contextError: string | null;
  details?: LocalTaskDetails;
  detailsLoadState?: LocalTaskLoadState;
  detailsError?: string | null;
  showTitle?: boolean;
  isMutationLoading: boolean;
  onStatusChange: (status: LocalTaskStatus) => void;
  onPriorityChange: (priority: LocalTaskPriority) => void;
  onTagIdsChange: (tagIds: string[]) => Promise<unknown>;
  onCreateTag: (name: string) => Promise<LocalTaskTagCatalogEntry>;
  onRetryDetails?: () => void;
  tagCatalog?: LocalTaskTagCatalogEntry[];
};

/** Renders a Local Task's content and editable metadata in a responsive details layout. */
export function WorkspaceTaskDetails({
  task,
  context,
  contextLoadState,
  contextError,
  details,
  detailsLoadState = "idle",
  detailsError = null,
  showTitle = true,
  isMutationLoading,
  onStatusChange,
  onPriorityChange,
  onTagIdsChange,
  onCreateTag,
  onRetryDetails,
  tagCatalog = [],
}: WorkspaceTaskDetailsProps) {
  const { t, i18n } = useTranslation();
  const handleRetryContext = useCallback(() => void loadLocalTaskContext(task.id), [task.id]);
  const updatedAtDate = new Date(task.updatedAt);
  const updatedAt = Number.isNaN(updatedAtDate.getTime())
    ? t("localTask.states.unknownDate")
    : new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(updatedAtDate);

  return (
    <Box sx={{ width: 1200, maxWidth: "100%", mx: "auto", mt: 2, containerType: "inline-size" }}>
      <Box
        data-testid="local-task-detail-layout"
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: "minmax(0, 1fr) 350px",
          "@container (max-width: 400px)": { gridTemplateColumns: "minmax(0, 1fr)" },
        }}
      >
        <Stack spacing={1} sx={{ minWidth: 0 }}>
          {showTitle ? (
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
              {task.title}
            </Typography>
          ) : null}
          <TaskDescriptionMarkdown content={task.description || t("localTask.states.noDescription")} />
          {detailsLoadState === "error" ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" onClick={onRetryDetails}>
                  {t("localTask.actions.retry")}
                </Button>
              }
            >
              {detailsError}
            </Alert>
          ) : null}
          {contextLoadState === "error" ? (
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
        </Stack>
        <WorkspaceTaskMetadataSidebar
          task={task}
          context={context}
          details={details}
          updatedAt={updatedAt}
          isMutationLoading={isMutationLoading}
          tagCatalog={tagCatalog}
          onStatusChange={onStatusChange}
          onPriorityChange={onPriorityChange}
          onTagIdsChange={onTagIdsChange}
          onCreateTag={onCreateTag}
          t={t}
        />
      </Box>
    </Box>
  );
}
