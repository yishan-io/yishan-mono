import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  CircularProgress,
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
import type { CreateScheduledJobInput } from "../../api/scheduledJobApi";
import { AgentIcon } from "../../components/AgentIcon";
import { renderProjectIcon } from "../../components/projectIcons";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "../../helpers/agentSettings";
import { VirtualizedListbox } from "../../components/VirtualizedListbox";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { useCommands } from "../../hooks/useCommands";
import { sessionStore } from "../../store/sessionStore";
import { workspaceStore } from "../../store/workspaceStore";
import {
  DEFAULT_FORM_DRAFT,
  SCHEDULE_TYPE_OPTIONS,
  type ScheduleType,
  type ScheduledJobFormDraft,
  TIMEZONE_OPTIONS,
  WEEKDAY_OPTIONS,
  computeNextRunEstimate,
  describeCronExpression,
  toCronExpression,
} from "./scheduledJobFormHelpers";

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

type CreateScheduledJobFormViewProps = {
  onCreated: () => void;
  onCancel?: () => void;
  onBusyChange?: (isBusy: boolean) => void;
};

/** Form for creating a new scheduled job. */
export function CreateScheduledJobFormView({ onCreated, onCancel, onBusyChange }: CreateScheduledJobFormViewProps) {
  const { t } = useTranslation();
  const { createScheduledJob } = useCommands();
  const orgId = sessionStore((state) => state.selectedOrganizationId);
  const daemonId = sessionStore((state) => state.daemonId);
  const selectedProjectId = workspaceStore((state) => state.selectedProjectId);
  const projects = workspaceStore((state) => state.projects);
  const [draft, setDraft] = useState<ScheduledJobFormDraft>(() => ({
    ...DEFAULT_FORM_DRAFT,
    projectId: selectedProjectId ?? "",
  }));
  const [scheduleType, setScheduleType] = useState<ScheduleType>("weekday");
  const [weeklyDay, setWeeklyDay] = useState("1");
  const [scheduleTime, setScheduleTime] = useState("09:00");

  useEffect(() => {
    if (draft.projectId || projects.length === 0) {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      projectId: projects[0]?.id ?? "",
    }));
  }, [draft.projectId, projects]);

  const nodesQuery = useQuery({
    queryKey: ["org-nodes", orgId],
    queryFn: () => api.node.listByOrg(orgId as string),
    enabled: Boolean(orgId),
  });

  // Once nodes load, pre-select the daemon's own node if the user hasn't
  // already picked one.
  useEffect(() => {
    const nodes = nodesQuery.data;
    if (!nodes || !daemonId) {
      return;
    }
    setDraft((prev) => {
      if (prev.nodeId) {
        return prev;
      }
      const daemonNode = nodes.find((node) => node.id === daemonId && node.scope === "private" && node.canUse);
      return daemonNode ? { ...prev, nodeId: daemonNode.id } : prev;
    });
  }, [nodesQuery.data, daemonId]);

  const createMutation = useMutation({
    mutationFn: async (input: CreateScheduledJobInput) => {
      await createScheduledJob(input);
    },
    onSuccess: () => {
      setDraft(DEFAULT_FORM_DRAFT);
      onCreated();
    },
  });

  const isCreating = createMutation.isPending;

  useEffect(() => {
    if (scheduleType === "custom") {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      cronExpression: toCronExpression(scheduleType, scheduleTime, weeklyDay),
    }));
  }, [scheduleType, scheduleTime, weeklyDay]);

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
      {
        onError: (error) => {
          console.error("Failed to create scheduled job", error);
        },
      },
    );
  };

  const nodes = nodesQuery.data ?? [];
  const isNodesLoading = nodesQuery.isLoading;
  const nodesError = nodesQuery.isError ? getErrorMessage(nodesQuery.error) : null;
  const nextRunEstimate = useMemo(() => {
    try {
      return computeNextRunEstimate(draft.cronExpression, draft.timezone || "UTC");
    } catch {
      return null;
    }
  }, [draft.cronExpression, draft.timezone, scheduleType, scheduleTime, weeklyDay]);
  const cronDescription = useMemo(() => describeCronExpression(draft.cronExpression), [draft.cronExpression]);

  return (
    <Stack
      spacing={2}
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.8fr 1fr" }, gap: 2 }}>
        <Stack spacing={1.25}>
          <TextField
            autoFocus
            fullWidth
            disabled={isCreating}
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
            disabled={isCreating}
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
              <TextField
                select
                size="small"
                fullWidth
                disabled={isCreating || projects.length === 0}
                value={draft.projectId}
                onChange={(e) => setDraft((prev) => ({ ...prev, projectId: e.target.value }))}
              >
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

            {nodesError ? (
              <Typography variant="caption" color="error">
                {nodesError}
              </Typography>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                  {t("scheduledJob.form.node")}
                </Typography>
                <TextField
                  select
                  size="small"
                  fullWidth
                  disabled={isCreating || isNodesLoading || nodes.length === 0}
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
              </Box>
            )}

            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                {t("scheduledJob.form.agentKind")}
              </Typography>
              <TextField
                select
                size="small"
                fullWidth
                disabled={isCreating}
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

            <Box>
              <TextField
                select
                size="small"
                fullWidth
                disabled={isCreating}
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
              >
                {SCHEDULE_TYPE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            {scheduleType === "weekly" ? (
              <Box>
                <TextField
                  select
                  size="small"
                  fullWidth
                  disabled={isCreating}
                  value={weeklyDay}
                  onChange={(e) => setWeeklyDay(e.target.value)}
                >
                  {WEEKDAY_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            ) : null}

            {scheduleType !== "custom" ? (
              <Box>
                <TextField
                  size="small"
                  fullWidth
                  disabled={isCreating}
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
              </Box>
            ) : null}

            {scheduleType === "custom" ? (
              <Box>
                <TextField
                  size="small"
                  fullWidth
                  disabled={isCreating}
                  value={draft.cronExpression}
                  onChange={(e) => setDraft((prev) => ({ ...prev, cronExpression: e.target.value }))}
                  placeholder={t("scheduledJob.form.cronExpressionPlaceholder")}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                  {cronDescription}
                </Typography>
              </Box>
            ) : null}

            <Box>
              <Autocomplete
                options={TIMEZONE_OPTIONS}
                value={draft.timezone}
                onChange={(_, value) => setDraft((prev) => ({ ...prev, timezone: value ?? "UTC" }))}
                disabled={isCreating}
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
            </Box>
          </Stack>
        </Box>
      </Box>

      {/* Submit error */}
      {createMutation.isError ? (
        <Typography variant="caption" color="error">
          {getErrorMessage(createMutation.error)}
        </Typography>
      ) : null}

      {/* Actions */}
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
