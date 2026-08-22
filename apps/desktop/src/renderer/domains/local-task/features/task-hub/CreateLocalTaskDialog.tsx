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
import { type FormEventHandler, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { createAndLinkLocalTask, createLocalTask, linkLocalTaskWorkspace } from "../../commands/localTaskCommands";
import type { LocalTask, LocalTaskLinkRole, LocalTaskPriority } from "../../localTaskTypes";
import { localTaskStore } from "../../state/localTaskStore";

type CreateLocalTaskDialogProps = {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
  defaultLinkRole?: LocalTaskLinkRole;
};

/** Collects metadata and creates one Local Task through the command layer. */
export function CreateLocalTaskDialog({
  open,
  onClose,
  workspaceId,
  defaultLinkRole = "related",
}: CreateLocalTaskDialogProps) {
  const { t } = useTranslation();
  const projects = projectStore((state) => state.projects);
  const isMutationLoading = localTaskStore((state) => state.isMutationLoading);
  const [project, setProject] = useState<WorkspaceProjectRecord | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<LocalTaskPriority>("medium");
  const [linkRole, setLinkRole] = useState<LocalTaskLinkRole>(defaultLinkRole);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTask, setCreatedTask] = useState<LocalTask | null>(null);
  const [partialLinkError, setPartialLinkError] = useState<string | null>(null);
  const handleProjectChange = useCallback(
    (_event: React.SyntheticEvent, nextProject: WorkspaceProjectRecord | null) => setProject(nextProject),
    [],
  );
  const renderProjectInput = useCallback(
    (params: AutocompleteRenderInputParams) => <TextField {...params} label={t("localTask.fields.project")} />,
    [t],
  );
  const resetAndClose = useCallback(() => {
    setProject(null);
    setTitle("");
    setDescription("");
    setPriority("medium");
    setLinkRole(defaultLinkRole);
    setSubmitError(null);
    setCreatedTask(null);
    setPartialLinkError(null);
    onClose();
  }, [defaultLinkRole, onClose]);
  const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
    async (event) => {
      event.preventDefault();
      const trimmedTitle = title.trim();
      if (!trimmedTitle || isMutationLoading) return;
      setSubmitError(null);
      setPartialLinkError(null);
      try {
        if (workspaceId && createdTask) {
          await linkLocalTaskWorkspace(createdTask.id, workspaceId, linkRole);
          resetAndClose();
          return;
        }
        const input = {
          projectId: project?.id,
          title: trimmedTitle,
          description: description.trim(),
          priority,
        };
        if (!workspaceId) {
          await createLocalTask(input);
          resetAndClose();
          return;
        }
        const result = await createAndLinkLocalTask(input, workspaceId, linkRole);
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
    [createdTask, description, isMutationLoading, linkRole, priority, project?.id, resetAndClose, title, workspaceId],
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
            disabled={isMutationLoading || Boolean(createdTask)}
            label={t("localTask.fields.title")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextField
            multiline
            minRows={3}
            disabled={isMutationLoading || Boolean(createdTask)}
            label={t("localTask.fields.description")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <TextField
            select
            disabled={isMutationLoading || Boolean(createdTask)}
            label={t("localTask.fields.priority")}
            value={priority}
            onChange={(event) => setPriority(event.target.value as LocalTaskPriority)}
          >
            <MenuItem value="low">{t("localTask.priority.low")}</MenuItem>
            <MenuItem value="medium">{t("localTask.priority.medium")}</MenuItem>
            <MenuItem value="high">{t("localTask.priority.high")}</MenuItem>
          </TextField>
          {workspaceId ? (
            <TextField
              select
              disabled={isMutationLoading}
              label={t("localTask.link.role")}
              value={linkRole}
              onChange={(event) => setLinkRole(event.target.value as LocalTaskLinkRole)}
            >
              <MenuItem value="related">{t("localTask.link.related")}</MenuItem>
              <MenuItem value="primary">{t("localTask.link.primary")}</MenuItem>
            </TextField>
          ) : null}
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
