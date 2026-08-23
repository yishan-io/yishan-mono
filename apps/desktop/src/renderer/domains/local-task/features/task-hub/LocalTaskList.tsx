import { Box, Chip, Paper, Tooltip, Typography } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowDown, LuArrowUp, LuMinus } from "react-icons/lu";
import type { LocalTask } from "../../localTaskTypes";
import { LocalTaskTagsDisplay } from "../tags/LocalTaskTagsDisplay";

const TASK_ROW_HEIGHT = 88;

const PRIORITY_ICONS = {
  low: LuArrowDown,
  medium: LuMinus,
  high: LuArrowUp,
} as const;

type LocalTaskListProps = {
  tasks: LocalTask[];
  onSelect: (taskId: string) => void;
  projectNameById: Readonly<Record<string, string>>;
};

/** Renders a virtualized Local Task result list. */
export function LocalTaskList({ tasks, onSelect, projectNameById }: LocalTaskListProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TASK_ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <Box sx={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const task = tasks[virtualRow.index];
          if (!task) return null;
          const PriorityIcon = PRIORITY_ICONS[task.priority];
          return (
            <Box
              key={task.id}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
              sx={{ position: "absolute", top: 0, left: 0, width: "100%", height: TASK_ROW_HEIGHT, px: 2, py: 0.5 }}
            >
              <Paper
                component="button"
                type="button"
                variant="outlined"
                onClick={() => onSelect(task.id)}
                sx={{
                  width: "100%",
                  height: "100%",
                  px: 1.5,
                  py: 1,
                  display: "flex",
                  gap: 1.5,
                  textAlign: "left",
                  color: "inherit",
                  bgcolor: "background.paper",
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Tooltip title={t(`localTask.priority.${task.priority}`)}>
                      <Box
                        component="span"
                        aria-label={`${t("localTask.fields.priority")}: ${t(`localTask.priority.${task.priority}`)}`}
                        sx={{
                          display: "inline-flex",
                          flexShrink: 0,
                          color:
                            task.priority === "high"
                              ? "error.main"
                              : task.priority === "medium"
                                ? "warning.main"
                                : "text.secondary",
                        }}
                      >
                        <PriorityIcon size={15} />
                      </Box>
                    </Tooltip>
                    <Typography sx={{ fontWeight: 600 }} noWrap>
                      {task.title}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {task.projectId
                      ? (projectNameById[task.projectId] ?? task.projectId)
                      : t("localTask.states.globalTask")}
                  </Typography>
                </Box>
                <LocalTaskTagsDisplay tags={task.tags} maxVisible={2} />
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Chip size="small" label={t(`localTask.status.${task.status}`)} />
                </Box>
              </Paper>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
