import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowDown, LuArrowUp, LuCircleCheck, LuCirclePause, LuCirclePlay, LuMinus } from "react-icons/lu";
import { loadLocalTaskContext } from "../../commands/localTaskCommands";
import type { LocalTask, LocalTaskLoadState, LocalTaskTagCatalogEntry } from "../../localTaskTypes";
import { LocalTaskTagsEditor } from "../tags/LocalTaskTagsEditor";
import { TaskDescriptionMarkdown } from "./TaskDescriptionMarkdown";

const STATUS_ICONS = {
  active: LuCirclePlay,
  paused: LuCirclePause,
  completed: LuCircleCheck,
} as const;

const PRIORITY_ICONS = {
  low: LuArrowDown,
  medium: LuMinus,
  high: LuArrowUp,
} as const;

type WorkspaceTaskDetailsProps = {
  task: LocalTask;
  contextLoadState: LocalTaskLoadState;
  contextError: string | null;
  showTitle?: boolean;
  isMutationLoading: boolean;
  onTagIdsChange: (tagIds: string[]) => Promise<unknown>;
  onCreateTag: (name: string) => Promise<LocalTaskTagCatalogEntry>;
  tagCatalog?: LocalTaskTagCatalogEntry[];
};

/** Renders metadata, lifecycle actions, and Task Context controls for the selected workspace task. */
export function WorkspaceTaskDetails({
  task,
  contextLoadState,
  contextError,
  showTitle = true,
  isMutationLoading,
  onTagIdsChange,
  onCreateTag,
  tagCatalog = [],
}: WorkspaceTaskDetailsProps) {
  const { t } = useTranslation();
  const handleRetryContext = useCallback(() => void loadLocalTaskContext(task.id), [task.id]);
  const StatusIcon = STATUS_ICONS[task.status];
  const PriorityIcon = PRIORITY_ICONS[task.priority];
  return (
    <Stack spacing={1}>
      {showTitle ? <Typography sx={{ fontWeight: 700 }}>{task.title}</Typography> : null}
      <Box
        data-testid="local-task-metadata"
        sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}
      >
        <Chip
          size="small"
          variant="outlined"
          icon={<StatusIcon data-testid="local-task-status-icon" />}
          label={t(`localTask.status.${task.status}`)}
          aria-label={`${t("localTask.fields.status")}: ${t(`localTask.status.${task.status}`)}`}
          sx={{
            "& .MuiChip-icon": {
              color:
                task.status === "active"
                  ? "success.main"
                  : task.status === "paused"
                    ? "warning.main"
                    : "text.secondary",
            },
          }}
        />
        <Chip
          size="small"
          variant="outlined"
          icon={<PriorityIcon data-testid="local-task-priority-icon" />}
          label={t(`localTask.priority.${task.priority}`)}
          aria-label={`${t("localTask.fields.priority")}: ${t(`localTask.priority.${task.priority}`)}`}
          sx={{
            "& .MuiChip-icon": {
              color:
                task.priority === "high"
                  ? "error.main"
                  : task.priority === "medium"
                    ? "warning.main"
                    : "text.secondary",
            },
          }}
        />
        <LocalTaskTagsEditor
          tagRefs={task.tagRefs}
          tags={task.tagRefs.length === 0 ? task.tags : undefined}
          tagCatalog={tagCatalog}
          onTagIdsChange={onTagIdsChange}
          onCreateTag={onCreateTag}
          isMutationLoading={isMutationLoading}
        />
      </Box>
      <TaskDescriptionMarkdown content={task.description || t("localTask.states.noDescription")} />
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
  );
}
