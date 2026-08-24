import { Box, IconButton, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuCheck, LuFolderOpen, LuPause, LuPlay } from "react-icons/lu";
import type { LocalTask } from "../../localTaskTypes";
import type { TaskHubDetailProjection } from "./useTaskHubDetailProjection";

type TaskHubDetailHeaderActionsProps = {
  task: LocalTask;
  detailProjection: TaskHubDetailProjection;
  onOpenContextFolder: () => void;
  onToggleStatus: () => void;
  onComplete: () => void;
};

/** Renders selected-task actions in the Task Hub header. */
export function TaskHubDetailHeaderActions({
  task,
  detailProjection,
  onOpenContextFolder,
  onToggleStatus,
  onComplete,
}: TaskHubDetailHeaderActionsProps) {
  const { t } = useTranslation();
  const isTaskActive = task.status === "active";

  return (
    <>
      <Tooltip title={t("localTask.context.openFolder")}>
        <Box component="span">
          <IconButton
            size="small"
            disabled={detailProjection.contextLoadState === "loading"}
            aria-label={t("localTask.context.openFolder")}
            onClick={onOpenContextFolder}
          >
            <LuFolderOpen size={16} />
          </IconButton>
        </Box>
      </Tooltip>
      <Tooltip title={t(isTaskActive ? "localTask.actions.pauseTask" : "localTask.actions.reactivateTask")}>
        <Box component="span">
          <IconButton
            size="small"
            disabled={detailProjection.isMutationLoading}
            aria-label={t(isTaskActive ? "localTask.actions.pauseTask" : "localTask.actions.reactivateTask")}
            onClick={onToggleStatus}
          >
            {isTaskActive ? <LuPause size={16} /> : <LuPlay size={16} />}
          </IconButton>
        </Box>
      </Tooltip>
      {task.status !== "completed" ? (
        <Tooltip title={t("localTask.actions.completeTask")}>
          <Box component="span">
            <IconButton
              size="small"
              disabled={detailProjection.isMutationLoading}
              aria-label={t("localTask.actions.completeTask")}
              onClick={onComplete}
            >
              <LuCheck size={16} />
            </IconButton>
          </Box>
        </Tooltip>
      ) : null}
    </>
  );
}
