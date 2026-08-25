import { Box, Chip, Paper, Tooltip, Typography } from "@mui/material";
import { renderProjectIcon } from "@renderer/domains/project";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowDown, LuArrowUp, LuMinus } from "react-icons/lu";
import type { LocalTask, LocalTaskTagCatalogEntry } from "../../localTaskTypes";
import { LocalTaskStatusIcon } from "../../ui/LocalTaskStatusIcon";
import { LocalTaskTagsDisplay } from "../../ui/LocalTaskTagsDisplay";

const TASK_ROW_ESTIMATE = 44;

const PRIORITY_ICONS = {
  low: LuArrowDown,
  medium: LuMinus,
  high: LuArrowUp,
} as const;

type ProjectDisplay = { name: string; icon: string; color: string };

type LocalTaskListProps = {
  tasks: LocalTask[];
  onSelect: (taskId: string) => void;
  projectDisplayById: Readonly<Record<string, ProjectDisplay>>;
  tagCatalog: LocalTaskTagCatalogEntry[];
};

/** Renders a virtualized Local Task result list. */
export function LocalTaskList({ tasks, onSelect, projectDisplayById, tagCatalog }: LocalTaskListProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TASK_ROW_ESTIMATE,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 8,
  });

  return (
    <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <Box sx={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const task = tasks[virtualRow.index];
          if (!task) return null;
          const PriorityIcon = PRIORITY_ICONS[task.priority];
          const project = task.projectId ? projectDisplayById[task.projectId] : undefined;
          return (
            <Box
              key={task.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
              sx={{ position: "absolute", top: 0, left: 0, width: "100%" }}
            >
              <Paper
                component="button"
                type="button"
                elevation={0}
                onClick={() => onSelect(task.id)}
                sx={{
                  width: "100%",
                  minHeight: TASK_ROW_ESTIMATE,
                  px: 1.5,
                  py: 0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  textAlign: "left",
                  color: "inherit",
                  bgcolor: "transparent",
                  border: 0,
                  boxShadow: "none",
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <LocalTaskStatusIcon status={task.status} label={t(`localTask.status.${task.status}`)} />
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
                    <Typography sx={{ fontSize: "0.8125rem" }} noWrap>
                      {task.title}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {project ? (
                    <Chip
                      size="small"
                      variant="outlined"
                      icon={
                        <Box
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: project.color,
                          }}
                        >
                          {renderProjectIcon(project.icon, 14)}
                        </Box>
                      }
                      label={project.name}
                      sx={{
                        "& .MuiChip-icon": { ml: 0.75 },
                        "& .MuiChip-label": { px: 1.25 },
                      }}
                    />
                  ) : task.projectId ? (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={task.projectId}
                      sx={{ "& .MuiChip-label": { px: 1.25 } }}
                    />
                  ) : null}
                  <LocalTaskTagsDisplay
                    tagRefs={task.tagRefs}
                    tags={task.tagRefs.length === 0 ? task.tags : undefined}
                    maxVisible={2}
                    tagCatalog={tagCatalog}
                  />
                </Box>
              </Paper>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
