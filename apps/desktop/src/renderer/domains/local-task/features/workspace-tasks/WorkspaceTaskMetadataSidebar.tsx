import {
  Box,
  ButtonBase,
  FormControl,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Stack,
  Typography,
} from "@mui/material";
import { FileTree } from "@renderer/domains/files";
import { renderProjectIcon } from "@renderer/domains/project";
import { useCallback } from "react";
import { HiCubeTransparent, HiOutlineCube } from "react-icons/hi2";
import { LuFolder } from "react-icons/lu";
import type {
  LocalTask,
  LocalTaskContextDetails,
  LocalTaskDetails,
  LocalTaskPriority,
  LocalTaskStatus,
  LocalTaskTagCatalogEntry,
} from "../../localTaskTypes";
import { LocalTaskKeyDisplay } from "../../ui/LocalTaskKeyDisplay";
import { LocalTaskPriorityIcon } from "../../ui/LocalTaskPriorityIcon";
import { LocalTaskStatusIcon } from "../../ui/LocalTaskStatusIcon";
import { LocalTaskTagsInlineEditor } from "../tags/LocalTaskTagsInlineEditor";

const STATUS_OPTIONS: LocalTaskStatus[] = ["new", "progressing", "done", "cancelled"];
const PRIORITY_OPTIONS: LocalTaskPriority[] = ["low", "medium", "high"];
const COMPACT_METADATA_SELECT_SX = { typography: "caption", "& .MuiSelect-select": { py: 0.5, pl: 1, pr: 4 } };
const SIDEBAR_SECTION_TITLE_SX = { display: "block", mb: 0.5 };
const NAVIGATION_ITEM_SX = {
  display: "inline-flex",
  alignItems: "center",
  gap: 0.75,
  px: 0.5,
  py: 0.25,
  borderRadius: 0.5,
  textAlign: "left",
  "&:hover": { bgcolor: "action.hover" },
};

type WorkspaceTaskMetadataSidebarProps = {
  task: LocalTask;
  context?: LocalTaskContextDetails;
  details?: LocalTaskDetails;
  updatedAt: string;
  showLocationMetadata: boolean;
  showStatusAndPriority: boolean;
  showTags: boolean;
  isSticky: boolean;
  isMutationLoading: boolean;
  tagCatalog: LocalTaskTagCatalogEntry[];
  onStatusChange: (status: LocalTaskStatus) => void;
  onPriorityChange: (priority: LocalTaskPriority) => void;
  onTagIdsChange: (tagIds: string[]) => Promise<unknown>;
  onCreateTag: (name: string) => Promise<LocalTaskTagCatalogEntry>;
  onProjectNavigate?: (projectId: string) => void;
  onWorkspaceNavigate?: (workspaceId: string, projectId: string) => void;
  onContextFileOpen?: (fileName: LocalTaskContextDetails["files"][number]["name"]) => void;
  t: (key: string) => string;
};

/** Renders editable Local Task metadata beside its description. */
export function WorkspaceTaskMetadataSidebar({
  task,
  context,
  details,
  updatedAt,
  showLocationMetadata,
  showStatusAndPriority,
  showTags,
  isSticky,
  isMutationLoading,
  tagCatalog,
  onStatusChange,
  onPriorityChange,
  onTagIdsChange,
  onCreateTag,
  onProjectNavigate,
  onWorkspaceNavigate,
  onContextFileOpen,
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
  const project = details?.project;
  const handleContextFileSelect = useCallback(
    (path: string, isDirectory: boolean) => {
      if (isDirectory) return;
      const file = context?.files.find((contextFile) => contextFile.name === path);
      if (file) onContextFileOpen?.(file.name);
    },
    [context?.files, onContextFileOpen],
  );

  return (
    <Stack
      data-testid="local-task-details-sidebar"
      spacing={3}
      sx={{ minWidth: 0, position: isSticky ? "sticky" : "static", top: 0, alignSelf: "start" }}
    >
      <Box>
        <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
          {t("localTask.fields.key")}
        </Typography>
        <LocalTaskKeyDisplay task={task} />
      </Box>
      {showStatusAndPriority ? (
        <>
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
                    <LocalTaskStatusIcon status={task.status} />
                    {t(`localTask.status.${task.status}`)}
                  </Box>
                )}
              >
                {STATUS_OPTIONS.map((status) => {
                  return (
                    <MenuItem key={status} value={status}>
                      <LocalTaskStatusIcon status={status} />
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
                    <LocalTaskPriorityIcon priority={task.priority} />
                    {t(`localTask.priority.${task.priority}`)}
                  </Box>
                )}
              >
                {PRIORITY_OPTIONS.map((priority) => {
                  return (
                    <MenuItem key={priority} value={priority}>
                      <LocalTaskPriorityIcon priority={priority} />
                      <Box component="span" sx={{ ml: 0.75 }}>
                        {t(`localTask.priority.${priority}`)}
                      </Box>
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </Box>
        </>
      ) : null}
      {showTags ? (
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
      ) : null}
      {showLocationMetadata ? (
        <>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
              {t("localTask.fields.project")}
            </Typography>
            {project ? (
              <ButtonBase
                data-testid="local-task-project-navigation"
                onClick={() => onProjectNavigate?.(project.id)}
                sx={NAVIGATION_ITEM_SX}
              >
                <Box
                  data-testid="local-task-project-icon"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    borderRadius: 0.5,
                    bgcolor: project.color,
                    color: "common.white",
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {renderProjectIcon(project.icon, 10)}
                </Box>
                <Typography variant="body2">{project.name}</Typography>
              </ButtonBase>
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
              <Stack component="ul" spacing={0.25} sx={{ my: 0, p: 0, listStyle: "none" }}>
                {details?.workspaces.map((workspaceDisplay) => {
                  const WorkspaceIcon =
                    workspaceDisplay.kind === "local"
                      ? HiOutlineCube
                      : workspaceDisplay.kind === "folder"
                        ? LuFolder
                        : HiCubeTransparent;
                  const isActive = workspaceDisplay.status === "active";
                  return (
                    <Box
                      component="li"
                      key={workspaceDisplay.id}
                      sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
                    >
                      {isActive ? (
                        <ButtonBase
                          data-testid="local-task-workspace-navigation"
                          onClick={() => onWorkspaceNavigate?.(workspaceDisplay.id, workspaceDisplay.projectId)}
                          sx={NAVIGATION_ITEM_SX}
                        >
                          <WorkspaceIcon data-testid="local-task-workspace-icon" size={16} />
                          <Typography variant="body2">{workspaceDisplay.name}</Typography>
                        </ButtonBase>
                      ) : (
                        <>
                          <WorkspaceIcon data-testid="local-task-workspace-icon" size={16} />
                          <Typography variant="body2">{workspaceDisplay.name}</Typography>
                        </>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {t(`localTask.workspaceStatus.${workspaceDisplay.status}`)}
                      </Typography>
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
        </>
      ) : null}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
          {t("localTask.fields.updatedAt")}
        </Typography>
        <Typography variant="body2">{updatedAt}</Typography>
      </Box>
      {context ? (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={SIDEBAR_SECTION_TITLE_SX}>
            {t("localTask.context.files")}
          </Typography>
          {context.files.length > 0 ? (
            <Box data-testid="task-context-file-tree" sx={{ height: 120 }}>
              <FileTree
                files={context.files.map((file) => file.name)}
                onSelectEntry={({ path, isDirectory }) => handleContextFileSelect(path, isDirectory)}
              />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {t("localTask.states.noValue")}
            </Typography>
          )}
        </Box>
      ) : null}
    </Stack>
  );
}
