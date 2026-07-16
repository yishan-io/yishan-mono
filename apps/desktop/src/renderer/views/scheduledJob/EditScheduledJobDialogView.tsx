import { Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ScheduledJobRecord } from "../../api/scheduledJobApi";
import { isDesktopAgentKind } from "../../helpers/agentSettings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { useCommands } from "../../hooks/useCommands";
import { useDialogRegistration } from "../../hooks/useDialogRegistration";
import { sessionStore } from "../../store/sessionStore";
import { workspaceStore } from "../../store/workspaceStore";
import { ScheduledJobFormFields } from "./form/ScheduledJobFormFields";
import { useScheduledJobFormState } from "./form/useScheduledJobFormState";
import { inferScheduleFromCron } from "./scheduledJobFormHelpers";

type EditScheduledJobDialogViewProps = {
  job: ScheduledJobRecord;
  open: boolean;
  onClose: () => void;
};

const editCustomCronDescriptionSx = { mt: -0.5 };

/** Dialog for editing an existing scheduled job's mutable fields. */
export function EditScheduledJobDialogView({ job, open, onClose }: EditScheduledJobDialogViewProps) {
  const { t } = useTranslation();
  const { updateScheduledJob } = useCommands();
  const orgId = sessionStore((state) => state.selectedOrganizationId);
  const projects = workspaceStore((state) => state.projects);
  useDialogRegistration(open);

  const initialState = useMemo(() => {
    const inferredSchedule = inferScheduleFromCron(job.cronExpression);
    return {
      draft: {
        name: job.name,
        projectId: job.projectId,
        nodeId: job.nodeId,
        agentKind: isDesktopAgentKind(job.agentKind) ? job.agentKind : "opencode",
        cronExpression: job.cronExpression,
        timezone: job.timezone,
        prompt: job.prompt,
      },
      scheduleType: inferredSchedule.scheduleType,
      weeklyDay: inferredSchedule.weeklyDay,
      scheduleTime: inferredSchedule.scheduleTime,
    };
  }, [job]);

  const {
    draft,
    setDraft,
    scheduleType,
    setScheduleType,
    scheduleTime,
    setScheduleTime,
    weeklyDay,
    setWeeklyDay,
    nodes,
    isNodesLoading,
    nodesError,
    cronDescription,
    nextRunEstimate,
    resetForm,
  } = useScheduledJobFormState({ initialState, orgId, projects });

  useEffect(() => {
    if (open) {
      resetForm(initialState);
    }
  }, [initialState, open, resetForm]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      await updateScheduledJob(job.id, {
        name: draft.name.trim(),
        nodeId: draft.nodeId,
        agentKind: draft.agentKind,
        cronExpression: draft.cronExpression.trim(),
        timezone: draft.timezone.trim() || "UTC",
        prompt: draft.prompt.trim(),
      });
    },
    onSuccess: onClose,
  });

  const isSaving = updateMutation.isPending;
  const isSubmitDisabled =
    isSaving ||
    !draft.name.trim() ||
    !draft.projectId ||
    !draft.nodeId ||
    !draft.cronExpression.trim() ||
    !draft.prompt.trim();
  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg" disableEscapeKeyDown={isSaving}>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Typography variant="h6">{t("scheduledJob.edit.title")}</Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pb: 2.5, pt: 1.5 }}>
        <Stack
          spacing={2}
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isSubmitDisabled) {
              updateMutation.mutate();
            }
          }}
        >
          <ScheduledJobFormFields
            draft={draft}
            setDraft={setDraft}
            scheduleType={scheduleType}
            setScheduleType={setScheduleType}
            weeklyDay={weeklyDay}
            setWeeklyDay={setWeeklyDay}
            scheduleTime={scheduleTime}
            setScheduleTime={setScheduleTime}
            projects={projects}
            nodes={nodes}
            isBusy={isSaving}
            isNodesLoading={isNodesLoading}
            nodesError={nodesError}
            cronDescription={cronDescription}
            nextRunEstimate={nextRunEstimate}
            isProjectEditable={false}
            showNodeLabelWhenError
            customCronDescriptionSx={editCustomCronDescriptionSx}
          />

          {updateMutation.isError ? (
            <Typography variant="caption" color="error">
              {getErrorMessage(updateMutation.error)}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={handleClose} disabled={isSaving}>
              {t("common.actions.cancel")}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitDisabled}
              startIcon={isSaving ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {isSaving ? t("common.actions.saving") : t("scheduledJob.edit.save")}
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
