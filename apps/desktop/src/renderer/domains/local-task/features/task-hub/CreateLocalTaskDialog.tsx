import {
  Alert,
  Autocomplete,
  type AutocompleteRenderInputParams,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  MenuItem,
  Select,
  type SelectChangeEvent,
  TextField,
} from "@mui/material";
import { type WorkspaceProjectRecord, projectStore, renderProjectIcon } from "@renderer/domains/project";
import { VirtualizedListbox } from "@renderer/ui/components/VirtualizedListbox";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createAndLinkLocalTask,
  createLocalTask,
  createLocalTaskTag,
  linkLocalTaskWorkspace,
  loadLocalTaskTagSuggestions,
} from "../../commands/localTaskCommands";
import type { LocalTask, LocalTaskPriority } from "../../localTaskTypes";
import { localTaskStore } from "../../state/localTaskStore";
import { LocalTaskPriorityIcon } from "../../ui/LocalTaskPriorityIcon";
import { LocalTaskTagsInput } from "../tags/LocalTaskTagsInput";
import { LocalTaskDescriptionEditor } from "./LocalTaskDescriptionEditor";

type CreateLocalTaskDialogProps = {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
};

type SubmitHandler = NonNullable<React.ComponentProps<"form">["onSubmit"]>;

const PRIORITY_OPTIONS: LocalTaskPriority[] = ["low", "medium", "high"];
const PROJECT_ICON_BADGE_SX = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  borderRadius: 0.5,
  color: "common.white",
  fontSize: 10,
  fontWeight: 700,
  flexShrink: 0,
};
const PROJECT_OPTION_SX = { display: "flex", alignItems: "center", gap: 1 };
const PRIORITY_VALUE_SX = { display: "flex", alignItems: "center", gap: 0.75 };

/** Collects metadata and creates one Local Task through the command layer. */
export function CreateLocalTaskDialog({ open, onClose, workspaceId }: CreateLocalTaskDialogProps) {
  const { t } = useTranslation();
  const projects = projectStore((state) => state.projects);
  const isMutationLoading = localTaskStore((state) => state.isMutationLoading);
  const tagCatalog = localTaskStore((state) => state.tagCatalog);
  const [project, setProject] = useState<WorkspaceProjectRecord | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<LocalTaskPriority>("medium");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTask, setCreatedTask] = useState<LocalTask | null>(null);
  const [partialLinkError, setPartialLinkError] = useState<string | null>(null);
  useEffect(() => {
    if (open) void loadLocalTaskTagSuggestions();
  }, [open]);
  const handleProjectChange = useCallback(
    (_event: React.SyntheticEvent, nextProject: WorkspaceProjectRecord | null) => setProject(nextProject),
    [],
  );
  const handlePriorityChange = useCallback(
    (event: SelectChangeEvent<LocalTaskPriority>) => setPriority(event.target.value),
    [],
  );
  const renderProjectInput = useCallback(
    (params: AutocompleteRenderInputParams) => (
      <TextField
        {...params}
        size="small"
        placeholder={t("localTask.fields.project")}
        slotProps={{
          ...params.slotProps,
          htmlInput: { ...params.slotProps.htmlInput, "aria-label": t("localTask.fields.project") },
          input: {
            ...params.slotProps.input,
            startAdornment: project ? (
              <>
                <Box sx={{ ...PROJECT_ICON_BADGE_SX, bgcolor: project.color ?? "primary.main", ml: 0.5 }}>
                  {renderProjectIcon(project.icon ?? undefined, 10)}
                </Box>
                {params.slotProps.input.startAdornment}
              </>
            ) : (
              params.slotProps.input.startAdornment
            ),
          },
        }}
      />
    ),
    [project, t],
  );
  const renderProjectOption = useCallback(
    (optionProps: React.HTMLAttributes<HTMLLIElement>, option: WorkspaceProjectRecord) => (
      <Box component="li" {...optionProps} sx={PROJECT_OPTION_SX}>
        <Box sx={{ ...PROJECT_ICON_BADGE_SX, bgcolor: option.color ?? "primary.main" }}>
          {renderProjectIcon(option.icon ?? undefined, 10)}
        </Box>
        {option.name}
      </Box>
    ),
    [],
  );
  const resetAndClose = useCallback(() => {
    setProject(null);
    setTitle("");
    setDescription("");
    setPriority("medium");
    setTagIds([]);
    setSubmitError(null);
    setCreatedTask(null);
    setPartialLinkError(null);
    onClose();
  }, [onClose]);
  const handleSubmit = useCallback<SubmitHandler>(
    async (event) => {
      event.preventDefault();
      const trimmedTitle = title.trim();
      if (!trimmedTitle || isMutationLoading) return;
      setSubmitError(null);
      setPartialLinkError(null);
      try {
        if (workspaceId && createdTask) {
          await linkLocalTaskWorkspace(createdTask.id, workspaceId);
          resetAndClose();
          return;
        }
        const input = {
          projectId: project?.id,
          organizationId: project?.organizationId,
          title: trimmedTitle,
          description: description.trim(),
          priority,
          tagIds,
        };
        if (!workspaceId) {
          await createLocalTask(input);
          resetAndClose();
          return;
        }
        const result = await createAndLinkLocalTask(input, workspaceId);
        if (result.status === "created") {
          setCreatedTask(result.task);
          setPartialLinkError(result.linkError);
          return;
        }
        resetAndClose();
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        if (createdTask) setPartialLinkError(errorMessage);
        else setSubmitError(errorMessage);
      }
    },
    [
      createdTask,
      description,
      isMutationLoading,
      priority,
      project?.id,
      project?.organizationId,
      resetAndClose,
      tagIds,
      title,
      workspaceId,
    ],
  );
  const handleDialogClose = useCallback(() => {
    if (!isMutationLoading) resetAndClose();
  }, [isMutationLoading, resetAndClose]);

  return (
    <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="md">
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>{t("localTask.create.title")}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "12px !important" }}>
          {submitError ? <Alert severity="error">{submitError}</Alert> : null}
          {createdTask && partialLinkError ? (
            <Alert severity="warning">
              {t("localTask.create.linkFailed", {
                title: createdTask.title,
                taskId: createdTask.id,
                error: partialLinkError,
              })}
            </Alert>
          ) : null}
          <Autocomplete
            size="small"
            disabled={isMutationLoading || Boolean(createdTask)}
            options={projects}
            value={project}
            onChange={handleProjectChange}
            getOptionLabel={(option) => option.name}
            renderInput={renderProjectInput}
            renderOption={renderProjectOption}
            slotProps={{ listbox: { component: VirtualizedListbox } }}
          />
          <TextField
            autoFocus
            required
            size="small"
            disabled={isMutationLoading || Boolean(createdTask)}
            placeholder={t("localTask.fields.title")}
            slotProps={{ htmlInput: { "aria-label": t("localTask.fields.title") } }}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <LocalTaskDescriptionEditor
            value={description}
            onChange={setDescription}
            disabled={isMutationLoading || Boolean(createdTask)}
            ariaLabel={t("localTask.fields.description")}
            placeholder={t("localTask.fields.description")}
          />
          <LocalTaskTagsInput
            tagIds={tagIds}
            tagCatalog={tagCatalog}
            onChange={setTagIds}
            onCreateTag={createLocalTaskTag}
            disabled={isMutationLoading || Boolean(createdTask)}
            disablePortal={false}
          />
          <FormControl size="small">
            <Select
              value={priority}
              onChange={handlePriorityChange}
              disabled={isMutationLoading || Boolean(createdTask)}
              inputProps={{ "aria-label": t("localTask.fields.priority") }}
              renderValue={() => (
                <Box sx={PRIORITY_VALUE_SX}>
                  <LocalTaskPriorityIcon priority={priority} />
                  {t(`localTask.priority.${priority}`)}
                </Box>
              )}
            >
              {PRIORITY_OPTIONS.map((priorityOption) => (
                <MenuItem key={priorityOption} value={priorityOption}>
                  <LocalTaskPriorityIcon priority={priorityOption} />
                  <Box component="span" sx={{ ml: 0.75 }}>
                    {t(`localTask.priority.${priorityOption}`)}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button disabled={isMutationLoading} onClick={handleDialogClose}>
            {t("common.actions.cancel")}
          </Button>
          <Button type="submit" variant="contained" disabled={!title.trim() || isMutationLoading}>
            {isMutationLoading ? (
              <CircularProgress size={16} color="inherit" />
            ) : createdTask ? (
              t("localTask.actions.retryLink")
            ) : (
              t("localTask.actions.create")
            )}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
