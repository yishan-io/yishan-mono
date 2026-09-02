import { Box, Button, Chip, Paper, Tooltip, Typography } from "@mui/material";
import { renderProjectIcon } from "@renderer/domains/project";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { LocalTask, LocalTaskTagCatalogEntry } from "../../localTaskTypes";
import { LocalTaskKeyDisplay } from "../../ui/LocalTaskKeyDisplay";
import { LocalTaskPriorityIcon } from "../../ui/LocalTaskPriorityIcon";
import { LocalTaskStatusIcon } from "../../ui/LocalTaskStatusIcon";
import { LocalTaskTagsDisplay } from "../../ui/LocalTaskTagsDisplay";

const TASK_ROW_ESTIMATE = 44;
const TASK_LIST_DATA_COLUMNS = "1.75rem minmax(3.25rem, 4.5rem) 1.75rem minmax(0, 1fr)";
const TASK_LIST_ROW_COLUMNS = `${TASK_LIST_DATA_COLUMNS} auto`;
type ProjectDisplay = { name: string; icon: string; color: string };

type LocalTaskListProps = {
  tasks: LocalTask[];
  onSelect: (taskId: string) => void;
  projectDisplayById: Readonly<Record<string, ProjectDisplay>>;
  tagCatalog: LocalTaskTagCatalogEntry[];
  unavailableTaskIds: ReadonlySet<string>;
  creatingTaskIds: ReadonlySet<string>;
  onCreateWorkspace: (task: LocalTask) => void;
};

/** Renders a virtualized Local Task result list. */
export function LocalTaskList({
  tasks,
  onSelect,
  projectDisplayById,
  tagCatalog,
  unavailableTaskIds,
  creatingTaskIds,
  onCreateWorkspace,
}: LocalTaskListProps) {
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
    <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, mx: 2, overflow: "auto" }}>
      <Box component="table" aria-label={t("localTask.title")} sx={{ width: "100%", tableLayout: "fixed" }}>
        <Box component="tbody" sx={{ display: "block", height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const task = tasks[virtualRow.index];
            if (!task) return null;
            const project = task.projectId ? projectDisplayById[task.projectId] : undefined;
            const canCreateWorkspace =
              task.projectId && !task.hasActiveWorkspace && task.status !== "done" && task.status !== "cancelled";
            const isWorkspaceCreationDisabled = unavailableTaskIds.has(task.id) || creatingTaskIds.has(task.id);
            return (
              <Paper
                component="tr"
                key={task.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                elevation={0}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
                onClick={() => onSelect(task.id)}
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  minHeight: TASK_ROW_ESTIMATE,
                  px: 1.5,
                  py: 0.5,
                  display: "grid",
                  gridTemplateColumns: TASK_LIST_ROW_COLUMNS,
                  alignItems: "center",
                  columnGap: 0.5,
                  color: "inherit",
                  bgcolor: "transparent",
                  boxShadow: "none",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box component="td" sx={{ p: 0 }}>
                  <Tooltip title={t(`localTask.priority.${task.priority}`)}>
                    <Box>
                      <LocalTaskPriorityIcon
                        priority={task.priority}
                        aria-label={`${t("localTask.fields.priority")}: ${t(`localTask.priority.${task.priority}`)}`}
                      />
                    </Box>
                  </Tooltip>
                </Box>
                <Box component="td" sx={{ minWidth: 0, overflow: "hidden", p: 0 }}>
                  <LocalTaskKeyDisplay task={task} />
                </Box>
                <Box component="td" sx={{ p: 0 }}>
                  <LocalTaskStatusIcon status={task.status} label={t(`localTask.status.${task.status}`)} />
                </Box>
                <Box component="td" sx={{ minWidth: 0, p: 0 }}>
                  <Box
                    component="button"
                    type="button"
                    aria-label={task.title}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(task.id);
                    }}
                    sx={{
                      width: "100%",
                      minWidth: 0,
                      p: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      flexWrap: "wrap",
                      textAlign: "left",
                      color: "inherit",
                      bgcolor: "transparent",
                      border: 0,
                      cursor: "pointer",
                    }}
                  >
                    <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }} noWrap>
                      {task.title}
                    </Typography>
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
                </Box>
                <Box component="td" sx={{ p: 0 }}>
                  {canCreateWorkspace ? (
                    <Button
                      size="small"
                      disabled={isWorkspaceCreationDisabled}
                      aria-label={t("localTask.actions.startWorkspaceForTask", { title: task.title })}
                      onClick={(event) => {
                        event.stopPropagation();
                        onCreateWorkspace(task);
                      }}
                    >
                      {t("localTask.actions.createWorkspace")}
                    </Button>
                  ) : null}
                </Box>
              </Paper>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
