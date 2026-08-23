import { Box, IconButton, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuArrowLeft, LuCheck, LuFolderOpen, LuPause, LuPlay } from "react-icons/lu";
import type { LocalTask } from "../../localTaskTypes";

type WorkspaceTaskDetailHeaderProps = {
  task?: LocalTask;
  isMutationLoading: boolean;
  isContextLoading: boolean;
  onBack: () => void;
  onOpenContextFolder: () => void;
  onToggleStatus: () => void;
  onComplete: () => void;
};

/** Renders detail-pane navigation and Local Task lifecycle controls. */
export function WorkspaceTaskDetailHeader({
  task,
  isMutationLoading,
  isContextLoading,
  onBack,
  onOpenContextFolder,
  onToggleStatus,
  onComplete,
}: WorkspaceTaskDetailHeaderProps) {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
      <Tooltip title={t("common.actions.back")}>
        <IconButton size="small" aria-label={t("common.actions.back")} onClick={onBack}>
          <LuArrowLeft size={17} />
        </IconButton>
      </Tooltip>
      <Box sx={{ flex: 1 }} />
      {task ? (
        <>
          <Tooltip title={t("localTask.context.openFolder")}>
            <Box component="span">
              <IconButton
                size="small"
                disabled={isContextLoading}
                aria-label={t("localTask.context.openFolder")}
                onClick={onOpenContextFolder}
              >
                <LuFolderOpen size={16} />
              </IconButton>
            </Box>
          </Tooltip>
          <Tooltip
            title={t(task.status === "active" ? "localTask.actions.pauseTask" : "localTask.actions.reactivateTask")}
          >
            <IconButton
              size="small"
              disabled={isMutationLoading}
              aria-label={t(
                task.status === "active" ? "localTask.actions.pauseTask" : "localTask.actions.reactivateTask",
              )}
              onClick={onToggleStatus}
            >
              {task.status === "active" ? <LuPause size={16} /> : <LuPlay size={16} />}
            </IconButton>
          </Tooltip>
          {task.status !== "completed" ? (
            <Tooltip title={t("localTask.actions.completeTask")}>
              <IconButton
                size="small"
                disabled={isMutationLoading}
                aria-label={t("localTask.actions.completeTask")}
                onClick={onComplete}
              >
                <LuCheck size={16} />
              </IconButton>
            </Tooltip>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
