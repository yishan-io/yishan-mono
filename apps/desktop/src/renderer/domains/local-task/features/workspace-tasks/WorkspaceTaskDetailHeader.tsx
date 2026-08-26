import { Box, Button, IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowLeft } from "react-icons/lu";
import type { LocalTaskPriority, LocalTaskStatus } from "../../localTaskTypes";
import { LocalTaskPriorityIcon } from "../../ui/LocalTaskPriorityIcon";
import { LocalTaskStatusIcon } from "../../ui/LocalTaskStatusIcon";

const STATUS_OPTIONS: LocalTaskStatus[] = ["new", "progressing", "done", "cancelled"];
const PRIORITY_OPTIONS: LocalTaskPriority[] = ["low", "medium", "high"];
const DETAIL_ACTION_BUTTON_SX = { fontSize: "0.75rem" };

type WorkspaceTaskDetailHeaderProps = {
  task?: { status: LocalTaskStatus; priority: LocalTaskPriority };
  isMutationLoading?: boolean;
  onBack: () => void;
  onStatusChange?: (status: LocalTaskStatus) => void;
  onPriorityChange?: (priority: LocalTaskPriority) => void;
};

/** Renders workspace task navigation and compact status and priority controls. */
export function WorkspaceTaskDetailHeader({
  task,
  isMutationLoading = false,
  onBack,
  onStatusChange,
  onPriorityChange,
}: WorkspaceTaskDetailHeaderProps) {
  const { t } = useTranslation();
  const [statusMenuAnchor, setStatusMenuAnchor] = useState<HTMLElement | null>(null);
  const [priorityMenuAnchor, setPriorityMenuAnchor] = useState<HTMLElement | null>(null);
  const handleOpenStatusMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setStatusMenuAnchor(event.currentTarget);
  }, []);
  const handleOpenPriorityMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setPriorityMenuAnchor(event.currentTarget);
  }, []);
  const handleCloseStatusMenu = useCallback(() => setStatusMenuAnchor(null), []);
  const handleClosePriorityMenu = useCallback(() => setPriorityMenuAnchor(null), []);
  const handleStatusChange = useCallback(
    (status: LocalTaskStatus) => {
      handleCloseStatusMenu();
      onStatusChange?.(status);
    },
    [handleCloseStatusMenu, onStatusChange],
  );
  const handlePriorityChange = useCallback(
    (priority: LocalTaskPriority) => {
      handleClosePriorityMenu();
      onPriorityChange?.(priority);
    },
    [handleClosePriorityMenu, onPriorityChange],
  );

  return (
    <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
      <Tooltip title={t("common.actions.back")}>
        <IconButton size="small" aria-label={t("common.actions.back")} onClick={onBack}>
          <LuArrowLeft size={17} />
        </IconButton>
      </Tooltip>
      {task ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: "auto" }}>
          <Tooltip title={t(`localTask.status.${task.status}`)}>
            <Button
              size="small"
              color="inherit"
              disabled={isMutationLoading}
              aria-label={t("localTask.fields.status")}
              sx={DETAIL_ACTION_BUTTON_SX}
              startIcon={<LocalTaskStatusIcon status={task.status} />}
              onClick={handleOpenStatusMenu}
            >
              {t(`localTask.status.${task.status}`)}
            </Button>
          </Tooltip>
          <Tooltip title={t(`localTask.priority.${task.priority}`)}>
            <Button
              size="small"
              color="inherit"
              disabled={isMutationLoading}
              aria-label={t("localTask.fields.priority")}
              sx={DETAIL_ACTION_BUTTON_SX}
              startIcon={<LocalTaskPriorityIcon priority={task.priority} />}
              onClick={handleOpenPriorityMenu}
            >
              {t(`localTask.priority.${task.priority}`)}
            </Button>
          </Tooltip>
          <Menu anchorEl={statusMenuAnchor} open={Boolean(statusMenuAnchor)} onClose={handleCloseStatusMenu}>
            {STATUS_OPTIONS.map((status) => (
              <MenuItem key={status} onClick={() => handleStatusChange(status)}>
                <LocalTaskStatusIcon status={status} />
                <Box component="span" sx={{ ml: 0.75 }}>
                  {t(`localTask.status.${status}`)}
                </Box>
              </MenuItem>
            ))}
          </Menu>
          <Menu anchorEl={priorityMenuAnchor} open={Boolean(priorityMenuAnchor)} onClose={handleClosePriorityMenu}>
            {PRIORITY_OPTIONS.map((priority) => (
              <MenuItem key={priority} onClick={() => handlePriorityChange(priority)}>
                <LocalTaskPriorityIcon priority={priority} />
                <Box component="span" sx={{ ml: 0.75 }}>
                  {t(`localTask.priority.${priority}`)}
                </Box>
              </MenuItem>
            ))}
          </Menu>
        </Box>
      ) : null}
    </Box>
  );
}
