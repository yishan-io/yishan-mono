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
  Typography,
} from "@mui/material";
import { VirtualizedListbox } from "@renderer/ui/components/VirtualizedListbox";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { linkLocalTaskWorkspace, loadLocalTaskLinkCandidates } from "../../commands/localTaskCommands";
import type { LocalTask, LocalTaskLinkRole } from "../../localTaskTypes";
import { localTaskStore } from "../../state/localTaskStore";

type LinkLocalTaskDialogProps = {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
};

/** Links an existing, not-currently-linked Local Task to the selected workspace. */
export function LinkLocalTaskDialog({ open, workspaceId, onClose }: LinkLocalTaskDialogProps) {
  const { t } = useTranslation();
  const isMutationLoading = localTaskStore((state) => state.isMutationLoading);
  const candidateWorkspaceId = localTaskStore((state) => state.linkCandidateWorkspaceId);
  const candidates = localTaskStore((state) => state.linkCandidateTasks);
  const candidateLoadState = localTaskStore((state) => state.linkCandidateLoadState);
  const candidateError = localTaskStore((state) => state.linkCandidateError);
  const [task, setTask] = useState<LocalTask | null>(null);
  const [role, setRole] = useState<LocalTaskLinkRole>("related");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submissionLockRef = useRef(false);
  const projectionMatches = candidateWorkspaceId === workspaceId;
  const isCandidateLoading = !projectionMatches || candidateLoadState === "idle" || candidateLoadState === "loading";
  const busy = isMutationLoading || isSubmitting;

  useEffect(() => {
    if (!open) return;
    setTask(null);
    setSubmitError(null);
    void loadLocalTaskLinkCandidates(workspaceId);
  }, [open, workspaceId]);

  const handleTaskChange = useCallback(
    (_event: React.SyntheticEvent, nextTask: LocalTask | null) => setTask(nextTask),
    [],
  );
  const handleRoleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setRole(event.target.value as LocalTaskLinkRole),
    [],
  );
  const getTaskLabel = useCallback((option: LocalTask) => option.title, []);
  const renderTaskInput = useCallback(
    (params: AutocompleteRenderInputParams) => <TextField {...params} label={t("localTask.link.task")} />,
    [t],
  );
  const retryCandidates = useCallback(() => void loadLocalTaskLinkCandidates(workspaceId), [workspaceId]);
  const resetAndClose = useCallback(() => {
    setTask(null);
    setRole("related");
    setSubmitError(null);
    onClose();
  }, [onClose]);
  const handleClose = useCallback(() => {
    if (!busy) resetAndClose();
  }, [busy, resetAndClose]);
  const handleLink = useCallback(async () => {
    if (!task || busy || submissionLockRef.current) return;
    submissionLockRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await linkLocalTaskWorkspace(task.id, workspaceId, role);
      resetAndClose();
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }, [busy, resetAndClose, role, task, workspaceId]);

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("localTask.link.title")}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "12px !important" }}>
        {submitError ? <Alert severity="error">{submitError}</Alert> : null}
        {isCandidateLoading ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={18} aria-label={t("localTask.link.loadingCandidates")} />
            <Typography variant="body2" color="text.secondary">
              {t("localTask.link.loadingCandidates")}
            </Typography>
          </Box>
        ) : candidateLoadState === "error" ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={retryCandidates}>
                {t("localTask.actions.retry")}
              </Button>
            }
          >
            {candidateError}
          </Alert>
        ) : (
          <Autocomplete
            disabled={busy}
            options={candidates}
            value={task}
            onChange={handleTaskChange}
            getOptionLabel={getTaskLabel}
            noOptionsText={t("localTask.link.noCandidates")}
            renderInput={renderTaskInput}
            slotProps={{ listbox: { component: VirtualizedListbox } }}
          />
        )}
        <TextField disabled={busy} select label={t("localTask.link.role")} value={role} onChange={handleRoleChange}>
          <MenuItem value="related">{t("localTask.link.related")}</MenuItem>
          <MenuItem value="primary">{t("localTask.link.primary")}</MenuItem>
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={handleClose}>
          {t("common.actions.cancel")}
        </Button>
        <Button variant="contained" disabled={!task || busy} onClick={handleLink}>
          {busy ? <CircularProgress size={16} color="inherit" /> : t("localTask.actions.link")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
