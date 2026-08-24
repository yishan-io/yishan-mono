import { Box, FormControl, MenuItem, Select, type SelectChangeEvent, Stack, Typography } from "@mui/material";
import { renderProjectIcon } from "@renderer/domains/project";
import { useCallback } from "react";
import { HiCubeTransparent, HiOutlineCube } from "react-icons/hi2";
import { LuArrowDown, LuArrowUp, LuCircleCheck, LuCirclePause, LuCirclePlay, LuFolder, LuMinus } from "react-icons/lu";
import type {
  LocalTask,
  LocalTaskContextDetails,
  LocalTaskDetails,
  LocalTaskPriority,
  LocalTaskStatus,
  LocalTaskTagCatalogEntry,
} from "../../localTaskTypes";
import { LocalTaskTagsInlineEditor } from "../tags/LocalTaskTagsInlineEditor";

const STATUS_ICONS = { active: LuCirclePlay, paused: LuCirclePause, completed: LuCircleCheck } as const;
const PRIORITY_ICONS = { low: LuArrowDown, medium: LuMinus, high: LuArrowUp } as const;
const STATUS_OPTIONS: LocalTaskStatus[] = ["active", "paused", "completed"];
const PRIORITY_OPTIONS: LocalTaskPriority[] = ["low", "medium", "high"];
const COMPACT_METADATA_SELECT_SX = { typography: "caption", "& .MuiSelect-select": { py: 0.5, pl: 1, pr: 4 } };
const SIDEBAR_SECTION_TITLE_SX = { display: "block", mb: 0.5 };
const CONTEXT_FILES_TITLE_SX = { ...SIDEBAR_SECTION_TITLE_SX, mt: 1 };

type WorkspaceTaskMetadataSidebarProps = {
  task: LocalTask;
  context?: LocalTaskContextDetails;
  details?: LocalTaskDetails;
  updatedAt: string;
  isMutationLoading: boolean;
  tagCatalog: LocalTaskTagCatalogEntry[];
  onStatusChange: (status: LocalTaskStatus) => void;
  onPriorityChange: (priority: LocalTaskPriority) => void;
  onTagIdsChange: (tagIds: string[]) => Promise<unknown>;
  onCreateTag: (name: string) => Promise<LocalTaskTagCatalogEntry>;
  t: (key: string) => string;
};

/** Renders editable Local Task metadata beside its description. */
export function WorkspaceTaskMetadataSidebar({
  task,
  context,
  details,
  updatedAt,
  isMutationLoading,
  tagCatalog,
  onStatusChange,
  onPriorityChange,
  onTagIdsChange,
  onCreateTag,
  t,
}: WorkspaceTaskMetadataSidebarProps) {
  const handleStatusChange = useCallback(
    (event: SelectChangeEvent<LocalTaskStatus>) => onStatusChange(event.target.value),
    [onStatusChange],
  );
  const handlePriorityChange = useCallback(
    (event: SelectChangeEvent<LocalTaskPriority>) => onPriorityChange(event.target.value),
    [onPriorityChange],
  );
  const StatusIcon = STATUS_ICONS[task.status];
  const PriorityIcon = PRIORITY_ICONS[task.priority];

  return (
    <Stack
      data-testid="local-task-details-sidebar"
      spacing={2}
      sx={{ minWidth: 0, position: "sticky", top: 0, alignSelf: "start" }}
    >
      <Box>
        <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
          {t("localTask.fields.status")}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 132 }}>
          <Select
            size="small"
            sx={COMPACT_METADATA_SELECT_SX}
            value={task.status}
            onChange={handleStatusChange}
            disabled={isMutationLoading}
            inputProps={{ "aria-label": t("localTask.fields.status") }}
            renderValue={() => (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <StatusIcon data-testid="local-task-status-icon" size={15} />
                {t(`localTask.status.${task.status}`)}
              </Box>
            )}
          >
            {STATUS_OPTIONS.map((status) => {
              const Icon = STATUS_ICONS[status];
              return (
                <MenuItem key={status} value={status}>
                  <Icon size={15} />
                  <Box component="span" sx={{ ml: 0.75 }}>
                    {t(`localTask.status.${status}`)}
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
          {t("localTask.fields.priority")}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 132 }}>
          <Select
            size="small"
            sx={COMPACT_METADATA_SELECT_SX}
            value={task.priority}
            onChange={handlePriorityChange}
            disabled={isMutationLoading}
            inputProps={{ "aria-label": t("localTask.fields.priority") }}
            renderValue={() => (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <PriorityIcon data-testid="local-task-priority-icon" size={15} />
                {t(`localTask.priority.${task.priority}`)}
              </Box>
            )}
          >
            {PRIORITY_OPTIONS.map((priority) => {
              const Icon = PRIORITY_ICONS[priority];
              return (
                <MenuItem key={priority} value={priority}>
                  <Icon size={15} />
                  <Box component="span" sx={{ ml: 0.75 }}>
                    {t(`localTask.priority.${priority}`)}
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
          {t("localTask.fields.tags")}
        </Typography>
        <LocalTaskTagsInlineEditor
          tagRefs={task.tagRefs}
          tags={task.tagRefs.length === 0 ? task.tags : undefined}
          tagCatalog={tagCatalog}
          onTagIdsChange={onTagIdsChange}
          onCreateTag={onCreateTag}
          isMutationLoading={isMutationLoading}
        />
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
          {t("localTask.fields.project")}
        </Typography>
        {details?.project ? (
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
            <Box
              data-testid="local-task-project-icon"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: 0.5,
                bgcolor: details.project.color,
                color: "common.white",
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {renderProjectIcon(details.project.icon, 10)}
            </Box>
            <Typography variant="body2">{details.project.name}</Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {task.projectId === null && details?.workspaces.length === 0
              ? t("localTask.states.globalTask")
              : t("localTask.states.noValue")}
          </Typography>
        )}
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
          {t("localTask.fields.workspace")}
        </Typography>
        {(details?.workspaces.length ?? 0) > 0 ? (
          <Stack component="ul" spacing={0.25} sx={{ my: 0, pl: 2 }}>
            {details?.workspaces.map((workspaceDisplay) => {
              const WorkspaceIcon =
                workspaceDisplay.kind === "local"
                  ? HiOutlineCube
                  : workspaceDisplay.kind === "folder"
                    ? LuFolder
                    : HiCubeTransparent;
              return (
                <Box component="li" key={workspaceDisplay.id} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <WorkspaceIcon data-testid="local-task-workspace-icon" size={16} />
                  <Typography variant="body2">{workspaceDisplay.name}</Typography>
                </Box>
              );
            })}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t("localTask.states.noValue")}
          </Typography>
        )}
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
          {t("localTask.fields.updatedAt")}
        </Typography>
        <Typography variant="body2">{updatedAt}</Typography>
      </Box>
      {context ? (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
            {t("localTask.context.directory")}
          </Typography>
          <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
            {context.directory}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={CONTEXT_FILES_TITLE_SX}>
            {t("localTask.context.files")}
          </Typography>
          <Stack component="ul" spacing={0.25} sx={{ my: 0, pl: 2 }}>
            {[context.planPath, context.notesPath, context.outcomePath].map((path) => (
              <Typography component="li" key={path} variant="body2">
                {path.split(/[\\/]/).at(-1)}
              </Typography>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
