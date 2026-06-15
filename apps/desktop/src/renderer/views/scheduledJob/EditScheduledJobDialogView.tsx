import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuClock3, LuCloud, LuGlobe, LuServer } from "react-icons/lu";
import { api } from "../../api";
import type { ScheduledJobRecord } from "../../api/scheduledJobApi";
import { AgentIcon } from "../../components/AgentIcon";
import { VirtualizedListbox } from "../../components/VirtualizedListbox";
import { renderProjectIcon } from "../../components/projectIcons";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  isDesktopAgentKind,
} from "../../helpers/agentSettings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { useCommands } from "../../hooks/useCommands";
import { useDialogRegistration } from "../../hooks/useDialogRegistration";
import { sessionStore } from "../../store/sessionStore";
import { workspaceStore } from "../../store/workspaceStore";
import {
  SCHEDULE_TYPE_OPTIONS,
  type ScheduleType,
  type ScheduledJobFormDraft,
  TIMEZONE_OPTIONS,
  WEEKDAY_OPTIONS,
  computeNextRunEstimate,
  describeCronExpression,
  inferScheduleFromCron,
  toCronExpression,
} from "./scheduledJobFormHelpers";

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

type EditScheduledJobDialogViewProps = {
  job: ScheduledJobRecord;
  open: boolean;
  onClose: () => void;
};

/** Dialog for editing an existing scheduled job's mutable fields. */
export function EditScheduledJobDialogView({ job, open, onClose }: EditScheduledJobDialogViewProps) {
  const { t } = useTranslation();
  const { updateScheduledJob } = useCommands();
  const orgId = sessionStore((state) => state.selectedOrganizationId);
  const projects = workspaceStore((state) => state.projects);
  useDialogRegistration(open);

  const inferred = inferScheduleFromCron(job.cronExpression);
  const [draft, setDraft] = useState<ScheduledJobFormDraft>(() => ({
    name: job.name,
    projectId: job.projectId,
    nodeId: job.nodeId,
    agentKind: isDesktopAgentKind(job.agentKind) ? job.agentKind : "opencode",
    cronExpression: job.cronExpression,
    timezone: job.timezone,
    prompt: job.prompt,
  }));
  const [scheduleType, setScheduleType] = useState<ScheduleType>(inferred.scheduleType);
  const [weeklyDay, setWeeklyDay] = useState(inferred.weeklyDay);
  const [scheduleTime, setScheduleTime] = useState(inferred.scheduleTime);

  const nodesQuery = useQuery({
    queryKey: ["org-nodes", orgId],
    queryFn: () => api.node.listByOrg(orgId as string),
    enabled: Boolean(orgId),
  });

  // Re-sync draft when the dialog opens with a (possibly updated) job.
  useEffect(() => {
    if (open) {
      const nextInferred = inferScheduleFromCron(job.cronExpression);
      setDraft({
        name: job.name,
        projectId: job.projectId,
        nodeId: job.nodeId,
        agentKind: isDesktopAgentKind(job.agentKind) ? job.agentKind : "opencode",
        cronExpression: job.cronExpression,
        timezone: job.timezone,
        prompt: job.prompt,
      });
      setScheduleType(nextInferred.scheduleType);
      setWeeklyDay(nextInferred.weeklyDay);
      setScheduleTime(nextInferred.scheduleTime);
    }
  }, [open, job]);

  useEffect(() => {
    if (scheduleType === "custom") {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      cronExpression: toCronExpression(scheduleType, scheduleTime, weeklyDay),
    }));
  }, [scheduleType, scheduleTime, weeklyDay]);

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
    onSuccess: () => {
      onClose();
    },
  });

  const isSaving = updateMutation.isPending;
  const nodes = nodesQuery.data ?? [];
  const isNodesLoading = nodesQuery.isLoading;
  const nodesError = nodesQuery.isError ? getErrorMessage(nodesQuery.error) : null;
  const nextRunEstimate = useMemo(() => {
    try {
      return computeNextRunEstimate(draft.cronExpression, draft.timezone || "UTC");
    } catch {
      return null;
    }
  }, [draft.cronExpression, draft.timezone]);
  const cronDescription = useMemo(() => describeCronExpression(draft.cronExpression), [draft.cronExpression]);

  const isSubmitDisabled =
    isSaving ||
    !draft.name.trim() ||
    !draft.projectId ||
    !draft.nodeId ||
    !draft.cronExpression.trim() ||
    !draft.prompt.trim();

  const handleClose = () => {
    if (isSaving) return;
    onClose();
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
          onSubmit={(e) => {
            e.preventDefault();
            if (!isSubmitDisabled) updateMutation.mutate();
          }}
        >
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.8fr 1fr" }, gap: 2 }}>
            <Stack spacing={1.25}>
              <TextField
                autoFocus
                fullWidth
                disabled={isSaving}
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t("scheduledJob.form.namePlaceholder")}
              />
              <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.08em", fontWeight: 700 }}>
                {t("scheduledJob.form.runbook")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("scheduledJob.form.runbookHint")}
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={18}
                maxRows={24}
                disabled={isSaving}
                value={draft.prompt}
                onChange={(e) => setDraft((prev) => ({ ...prev, prompt: e.target.value }))}
                placeholder={t("scheduledJob.form.promptPlaceholder")}
              />
            </Stack>

            <Box sx={{ p: 0.5 }}>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                    {t("scheduledJob.form.project")}
                  </Typography>
                  <TextField select size="small" fullWidth disabled value={draft.projectId}>
                    {projects.map((project) => (
                      <MenuItem key={project.id} value={project.id}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Avatar
                            variant="rounded"
                            sx={{
                              width: 16,
                              height: 16,
                              bgcolor: project.color ?? "primary.main",
                              color: "common.white",
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            {renderProjectIcon(project.icon ?? undefined, 10)}
                          </Avatar>
                          {project.name}
                        </Box>
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                    {t("scheduledJob.form.node")}
                  </Typography>
                  {nodesError ? (
                    <Typography variant="caption" color="error">
                      {nodesError}
                    </Typography>
                  ) : (
                    <TextField
                      select
                      size="small"
                      fullWidth
                      disabled={isSaving || isNodesLoading || nodes.length === 0}
                      value={draft.nodeId}
                      onChange={(e) => setDraft((prev) => ({ ...prev, nodeId: e.target.value }))}
                      slotProps={{
                        input: {
                          endAdornment: isNodesLoading ? <CircularProgress size={14} sx={{ mr: 2 }} /> : undefined,
                        },
                      }}
                    >
                      {nodes.map((node) => (
                        <MenuItem key={node.id} value={node.id}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Box component="span" sx={{ display: "inline-flex", color: "text.secondary" }}>
                              {node.scope === "shared" ? <LuCloud size={14} /> : <LuServer size={14} />}
                            </Box>
                            {node.name}
                          </Box>
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                    {t("scheduledJob.form.agentKind")}
                  </Typography>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    disabled={isSaving}
                    value={draft.agentKind}
                    onChange={(e) => setDraft((prev) => ({ ...prev, agentKind: e.target.value as DesktopAgentKind }))}
                  >
                    {SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => (
                      <MenuItem key={agentKind} value={agentKind}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <AgentIcon agentKind={agentKind} context="settingsRow" decorative />
                          {t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind])}
                        </Box>
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <Divider />
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {t("scheduledJob.form.scheduleSection")}
                </Typography>

                <TextField
                  select
                  size="small"
                  fullWidth
                  disabled={isSaving}
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
                >
                  {SCHEDULE_TYPE_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </MenuItem>
                  ))}
                </TextField>

                {scheduleType === "weekly" ? (
                  <TextField
                    select
                    size="small"
                    fullWidth
                    disabled={isSaving}
                    value={weeklyDay}
                    onChange={(e) => setWeeklyDay(e.target.value)}
                  >
                    {WEEKDAY_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}

                {scheduleType !== "custom" ? (
                  <TextField
                    size="small"
                    fullWidth
                    disabled={isSaving}
                    type="text"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    placeholder="09:00"
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <LuClock3 size={16} />
                          </InputAdornment>
                        ),
                      },
                      htmlInput: {
                        inputMode: "numeric",
                        pattern: "[0-2][0-9]:[0-5][0-9]",
                      },
                    }}
                  />
                ) : null}

                {scheduleType === "custom" ? (
                  <TextField
                    size="small"
                    fullWidth
                    disabled={isSaving}
                    value={draft.cronExpression}
                    onChange={(e) => setDraft((prev) => ({ ...prev, cronExpression: e.target.value }))}
                    placeholder={t("scheduledJob.form.cronExpressionPlaceholder")}
                  />
                ) : null}
                {scheduleType === "custom" ? (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
                    {cronDescription}
                  </Typography>
                ) : null}

                <Autocomplete
                  options={TIMEZONE_OPTIONS}
                  value={draft.timezone}
                  onChange={(_, value) => setDraft((prev) => ({ ...prev, timezone: value ?? "UTC" }))}
                  disabled={isSaving}
                  size="small"
                  autoHighlight
                  ListboxComponent={VirtualizedListbox}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      placeholder="UTC"
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <>
                            <InputAdornment position="start">
                              <LuGlobe size={16} style={{ marginLeft: 8 }} />
                            </InputAdornment>
                            {params.InputProps.startAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                  {nextRunEstimate
                    ? t("scheduledJob.form.nextRunEstimate", {
                        value: nextRunEstimate.toLocaleString(undefined, {
                          timeZone: draft.timezone || "UTC",
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        }),
                      })
                    : t("scheduledJob.form.nextRunEstimateUnavailable")}
                </Typography>
              </Stack>
            </Box>
          </Box>

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
