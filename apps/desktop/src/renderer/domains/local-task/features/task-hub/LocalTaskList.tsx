import { Box, Chip, Paper, Typography } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { LocalTask } from "../../localTaskTypes";

const TASK_ROW_HEIGHT = 88;

type LocalTaskListProps = {
  tasks: LocalTask[];
};

/** Renders a virtualized Local Task result list. */
export function LocalTaskList({ tasks }: LocalTaskListProps) {
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
          return (
            <Box
              key={task.id}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
              sx={{ position: "absolute", top: 0, left: 0, width: "100%", height: TASK_ROW_HEIGHT, px: 2, py: 0.5 }}
            >
              <Paper variant="outlined" sx={{ height: "100%", px: 1.5, py: 1, display: "flex", gap: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>
                    {task.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {task.description || task.id}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                  <Chip size="small" label={t(`localTask.status.${task.status}`)} />
                  <Chip size="small" variant="outlined" label={t(`localTask.priority.${task.priority}`)} />
                </Box>
              </Paper>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
