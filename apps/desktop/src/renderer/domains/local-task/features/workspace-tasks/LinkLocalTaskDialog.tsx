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
  TextField,
  Typography,
} from "@mui/material";
import { VirtualizedListbox } from "@renderer/ui/components/VirtualizedListbox";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { linkLocalTaskWorkspace, loadLocalTaskLinkCandidates } from "../../commands/localTaskCommands";
import type { LocalTask } from "../../localTaskTypes";
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
  const getTaskLabel = useCallback((option: LocalTask) => option.title, []);
  const renderTaskInput = useCallback(
    (params: AutocompleteRenderInputParams) => <TextField {...params} size="small" label={t("localTask.link.task")} />,
    [t],
  );
  const retryCandidates = useCallback(() => void loadLocalTaskLinkCandidates(workspaceId), [workspaceId]);
  const resetAndClose = useCallback(() => {
    setTask(null);
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
      await linkLocalTaskWorkspace(task.id, workspaceId);
      resetAndClose();
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }, [busy, resetAndClose, task, workspaceId]);

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
            size="small"
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
