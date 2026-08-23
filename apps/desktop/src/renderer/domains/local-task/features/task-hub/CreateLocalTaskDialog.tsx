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
  MenuItem,
  TextField,
} from "@mui/material";
import { type WorkspaceProjectRecord, projectStore } from "@renderer/domains/project";
import { VirtualizedListbox } from "@renderer/ui/components/VirtualizedListbox";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createAndLinkLocalTask,
  createLocalTask,
  linkLocalTaskWorkspace,
  loadLocalTaskTagSuggestions,
  updateLocalTaskTagColor,
} from "../../commands/localTaskCommands";
import type { LocalTask, LocalTaskPriority } from "../../localTaskTypes";
import { localTaskStore } from "../../state/localTaskStore";
import { LocalTaskTagsInput } from "../tags/LocalTaskTagsInput";

type CreateLocalTaskDialogProps = {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
};

type SubmitHandler = NonNullable<React.ComponentProps<"form">["onSubmit"]>;

/** Collects metadata and creates one Local Task through the command layer. */
export function CreateLocalTaskDialog({ open, onClose, workspaceId }: CreateLocalTaskDialogProps) {
  const { t } = useTranslation();
  const projects = projectStore((state) => state.projects);
  const isMutationLoading = localTaskStore((state) => state.isMutationLoading);
  const tagSuggestions = localTaskStore((state) => state.tagSuggestions);
  const tagCatalog = localTaskStore((state) => state.tagCatalog);
  const [project, setProject] = useState<WorkspaceProjectRecord | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<LocalTaskPriority>("medium");
  const [tags, setTags] = useState<string[]>([]);
  const [isTagsDraftValid, setIsTagsDraftValid] = useState(true);
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
  const renderProjectInput = useCallback(
    (params: AutocompleteRenderInputParams) => (
      <TextField {...params} size="small" label={t("localTask.fields.project")} />
    ),
    [t],
  );
  const resetAndClose = useCallback(() => {
    setProject(null);
    setTitle("");
    setDescription("");
    setPriority("medium");
    setTags([]);
    setIsTagsDraftValid(true);
    setSubmitError(null);
    setCreatedTask(null);
    setPartialLinkError(null);
    onClose();
  }, [onClose]);
  const handleSubmit = useCallback<SubmitHandler>(
    async (event) => {
      event.preventDefault();
      const trimmedTitle = title.trim();
      if (!trimmedTitle || isMutationLoading || !isTagsDraftValid) return;
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
          title: trimmedTitle,
          description: description.trim(),
          priority,
          tags,
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
      resetAndClose,
      tags,
      isTagsDraftValid,
      title,
      workspaceId,
    ],
  );
  const handleDialogClose = useCallback(() => {
    if (!isMutationLoading) resetAndClose();
  }, [isMutationLoading, resetAndClose]);

  return (
    <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="sm">
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
            slotProps={{ listbox: { component: VirtualizedListbox } }}
          />
          <TextField
            autoFocus
            required
            size="small"
            disabled={isMutationLoading || Boolean(createdTask)}
            label={t("localTask.fields.title")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextField
            multiline
            minRows={3}
            size="small"
            disabled={isMutationLoading || Boolean(createdTask)}
            label={t("localTask.fields.description")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <LocalTaskTagsInput
            tags={tags}
            suggestions={tagSuggestions}
            tagCatalog={tagCatalog}
            onChange={setTags}
            onTagColorChange={updateLocalTaskTagColor}
            onDraftValidityChange={setIsTagsDraftValid}
            disabled={isMutationLoading || Boolean(createdTask)}
          />
          <TextField
            select
            size="small"
            disabled={isMutationLoading || Boolean(createdTask)}
            label={t("localTask.fields.priority")}
            value={priority}
            onChange={(event) => setPriority(event.target.value as LocalTaskPriority)}
          >
            <MenuItem value="low">{t("localTask.priority.low")}</MenuItem>
            <MenuItem value="medium">{t("localTask.priority.medium")}</MenuItem>
            <MenuItem value="high">{t("localTask.priority.high")}</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button disabled={isMutationLoading} onClick={handleDialogClose}>
            {t("common.actions.cancel")}
          </Button>
          <Button type="submit" variant="contained" disabled={!title.trim() || isMutationLoading || !isTagsDraftValid}>
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
