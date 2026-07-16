import { Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CreateScheduledJobInput } from "../../api/scheduledJobApi";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { useCommands } from "../../hooks/useCommands";
import { sessionStore } from "../../store/sessionStore";
import { workspaceStore } from "../../store/workspaceStore";
import { ScheduledJobFormFields } from "./form/ScheduledJobFormFields";
import { useScheduledJobFormState } from "./form/useScheduledJobFormState";
import { DEFAULT_FORM_DRAFT } from "./scheduledJobFormHelpers";

type CreateScheduledJobFormViewProps = {
  onCreated: () => void;
  onCancel?: () => void;
  onBusyChange?: (isBusy: boolean) => void;
};

const createScheduleState = { scheduleType: "weekday" as const, scheduleTime: "09:00", weeklyDay: "1" };
const createCustomCronDescriptionSx = { display: "block", mt: 0.75 };

/** Form for creating a new scheduled job. */
export function CreateScheduledJobFormView({ onCreated, onCancel, onBusyChange }: CreateScheduledJobFormViewProps) {
  const { t } = useTranslation();
  const { createScheduledJob } = useCommands();
  const orgId = sessionStore((state) => state.selectedOrganizationId);
  const daemonId = sessionStore((state) => state.daemonId);
  const selectedProjectId = workspaceStore((state) => state.selectedProjectId);
  const projects = workspaceStore((state) => state.projects);
  const initialState = useMemo(
    () => ({ draft: { ...DEFAULT_FORM_DRAFT, projectId: selectedProjectId ?? "" }, ...createScheduleState }),
    [selectedProjectId],
  );

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
  } = useScheduledJobFormState({ initialState, orgId, projects, daemonId });

  const createMutation = useMutation({
    mutationFn: async (input: CreateScheduledJobInput) => {
      await createScheduledJob(input);
    },
    onSuccess: () => {
      resetForm({ draft: DEFAULT_FORM_DRAFT, ...createScheduleState });
      onCreated();
    },
  });

  const isCreating = createMutation.isPending;
  useEffect(() => {
    onBusyChange?.(isCreating);
  }, [isCreating, onBusyChange]);

  const isSubmitDisabled =
    isCreating ||
    !draft.name.trim() ||
    !draft.projectId ||
    !draft.nodeId ||
    !draft.cronExpression.trim() ||
    !draft.prompt.trim();
  const handleSubmit = () => {
    if (isSubmitDisabled) {
      return;
    }
    createMutation.mutate(
      {
        name: draft.name.trim(),
        projectId: draft.projectId,
        nodeId: draft.nodeId,
        agentKind: draft.agentKind,
        cronExpression: draft.cronExpression.trim(),
        prompt: draft.prompt.trim(),
        timezone: draft.timezone.trim() || "UTC",
      },
      { onError: (error) => console.error("Failed to create scheduled job", error) },
    );
  };

  return (
    <Stack
      spacing={2}
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
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
        isBusy={isCreating}
        isNodesLoading={isNodesLoading}
        nodesError={nodesError}
        cronDescription={cronDescription}
        nextRunEstimate={nextRunEstimate}
        isProjectEditable
        showNodeLabelWhenError={false}
        customCronDescriptionSx={createCustomCronDescriptionSx}
      />

      {createMutation.isError ? (
        <Typography variant="caption" color="error">
          {getErrorMessage(createMutation.error)}
        </Typography>
      ) : null}
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 0.5 }}>
        {onCancel ? (
          <Button onClick={onCancel} disabled={isCreating}>
            {t("common.actions.cancel")}
          </Button>
        ) : null}
        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitDisabled}
          startIcon={isCreating ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {isCreating ? t("scheduledJob.form.creating") : t("scheduledJob.form.submit")}
        </Button>
      </Stack>
    </Stack>
  );
}
