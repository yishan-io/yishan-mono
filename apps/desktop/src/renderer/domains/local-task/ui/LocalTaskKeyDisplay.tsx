import { Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { LocalTask } from "../localTaskTypes";

type LocalTaskKeyDisplayProps = {
  task: Pick<LocalTask, "id" | "key">;
};

/** Renders a compact task key or an explicit legacy UUID backfill state. */
export function LocalTaskKeyDisplay({ task }: LocalTaskKeyDisplayProps) {
  const { t } = useTranslation();
  if (task.key) {
    return (
      <Typography component="span" variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontWeight: 700 }}>
        {task.key}
      </Typography>
    );
  }

  const fallback = t("localTask.states.uuidKeyPending", { taskId: task.id });
  return (
    <Tooltip title={fallback}>
      <Typography component="span" variant="caption" color="warning.main" sx={{ flexShrink: 0 }} noWrap>
        {fallback}
      </Typography>
    </Tooltip>
  );
}
