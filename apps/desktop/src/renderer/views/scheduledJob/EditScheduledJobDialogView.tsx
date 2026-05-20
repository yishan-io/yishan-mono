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
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuClock3, LuCloud, LuGlobe, LuServer } from "react-icons/lu";
import { api } from "../../api";
import type { ScheduledJobRecord } from "../../api/scheduledJobApi";
import { AgentIcon } from "../../components/AgentIcon";
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

// ---------------------------------------------------------------------------
// Virtualised listbox (same pattern as CreateScheduledJobFormView)
// ---------------------------------------------------------------------------

const ITEM_HEIGHT = 36;
const MAX_VISIBLE_ITEMS = 8;

const VirtualizedListbox = forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLElement>>(function VirtualizedListbox(
  { children, ...rest },
  ref,
) {
  const items = React.Children.toArray(children);
  const count = items.length;
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  const totalHeight = virtualizer.getTotalSize();
  const visibleHeight = Math.min(count, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT;

  return (
    <ul ref={ref} {...rest} style={{ ...rest.style, padding: 0, margin: 0, listStyle: "none" }}>
      <div ref={containerRef} style={{ overflow: "auto", maxHeight: visibleHeight }}>
        <div style={{ height: totalHeight, position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {items[virtualItem.index]}
            </div>
          ))}
        </div>
      </div>
    </ul>
  );
});

// ---------------------------------------------------------------------------
// IANA timezones
// ---------------------------------------------------------------------------

const TIMEZONE_OPTIONS: string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

type EditScheduledJobDialogViewProps = {
  job: ScheduledJobRecord;
  open: boolean;
  onClose: () => void;
};

type FormDraft = {
  name: string;
  projectId: string;
  nodeId: string;
  agentKind: DesktopAgentKind;
  cronExpression: string;
  timezone: string;
  prompt: string;
};

type ScheduleType = "daily" | "weekly" | "weekday" | "hourly" | "custom";

const SCHEDULE_TYPE_OPTIONS: { value: ScheduleType; labelKey: string }[] = [
  { value: "daily", labelKey: "scheduledJob.form.scheduleTypes.daily" },
  { value: "weekly", labelKey: "scheduledJob.form.scheduleTypes.weekly" },
  { value: "weekday", labelKey: "scheduledJob.form.scheduleTypes.weekday" },
  { value: "hourly", labelKey: "scheduledJob.form.scheduleTypes.hourly" },
  { value: "custom", labelKey: "scheduledJob.form.scheduleTypes.custom" },
];

const WEEKDAY_OPTIONS = [
  { value: "1", labelKey: "scheduledJob.form.weekdays.monday" },
  { value: "2", labelKey: "scheduledJob.form.weekdays.tuesday" },
  { value: "3", labelKey: "scheduledJob.form.weekdays.wednesday" },
  { value: "4", labelKey: "scheduledJob.form.weekdays.thursday" },
  { value: "5", labelKey: "scheduledJob.form.weekdays.friday" },
  { value: "6", labelKey: "scheduledJob.form.weekdays.saturday" },
  { value: "0", labelKey: "scheduledJob.form.weekdays.sunday" },
];

function toCronExpression(scheduleType: ScheduleType, scheduleTime: string, weeklyDay: string): string {
  const [hourString, minuteString] = scheduleTime.split(":");
  const hour = Number.parseInt(hourString ?? "9", 10);
  const minute = Number.parseInt(minuteString ?? "0", 10);
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 9;
  const safeMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0;

  if (scheduleType === "daily") return `${safeMinute} ${safeHour} * * *`;
  if (scheduleType === "weekly") return `${safeMinute} ${safeHour} * * ${weeklyDay}`;
  if (scheduleType === "weekday") return `${safeMinute} ${safeHour} * * 1-5`;
  if (scheduleType === "hourly") return `${safeMinute} * * * *`;
  return `${safeMinute} ${safeHour} * * 1-5`;
}

function inferScheduleFromCron(cronExpression: string): {
  scheduleType: ScheduleType;
  scheduleTime: string;
  weeklyDay: string;
} {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { scheduleType: "custom", scheduleTime: "09:00", weeklyDay: "1" };
  }

  const minute = parts[0] ?? "0";
  const hour = parts[1] ?? "9";
  const dayOfWeek = parts[4] ?? "*";
  const time = `${String(Number.parseInt(hour, 10) || 0).padStart(2, "0")}:${String(Number.parseInt(minute, 10) || 0).padStart(2, "0")}`;

  if (parts[2] === "*" && parts[3] === "*" && dayOfWeek === "*" && /^\d+$/.test(hour)) {
    return { scheduleType: "daily", scheduleTime: time, weeklyDay: "1" };
  }
  if (parts[2] === "*" && parts[3] === "*" && dayOfWeek === "1-5" && /^\d+$/.test(hour)) {
    return { scheduleType: "weekday", scheduleTime: time, weeklyDay: "1" };
  }
  if (parts[2] === "*" && parts[3] === "*" && /^\d$/.test(dayOfWeek) && /^\d+$/.test(hour)) {
    return { scheduleType: "weekly", scheduleTime: time, weeklyDay: dayOfWeek };
  }
  if (parts[2] === "*" && parts[3] === "*" && dayOfWeek === "*" && hour === "*") {
    return { scheduleType: "hourly", scheduleTime: `00:${String(Number.parseInt(minute, 10) || 0).padStart(2, "0")}`, weeklyDay: "1" };
  }

  return { scheduleType: "custom", scheduleTime: time, weeklyDay: "1" };
}

function parseCronFieldPart(part: string, min: number, max: number): Set<number> | null {
  const normalized = part.trim();
  if (!normalized) {
    return null;
  }

  const values = new Set<number>();
  for (const segment of normalized.split(",")) {
    const token = segment.trim();
    if (!token) {
      return null;
    }

    if (token === "*") {
      for (let value = min; value <= max; value += 1) {
        values.add(value);
      }
      continue;
    }

    if (token.includes("-")) {
      const [startPart, endPart] = token.split("-");
      const start = Number.parseInt(startPart ?? "", 10);
      const end = Number.parseInt(endPart ?? "", 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < min || end > max) {
        return null;
      }
      for (let value = start; value <= end; value += 1) {
        values.add(value);
      }
      continue;
    }

    const numeric = Number.parseInt(token, 10);
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
      return null;
    }
    values.add(numeric);
  }

  return values;
}

function parseCronExpression(cronExpression: string): {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
} | null {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const minute = parseCronFieldPart(parts[0] ?? "", 0, 59);
  const hour = parseCronFieldPart(parts[1] ?? "", 0, 23);
  const dayOfMonth = parseCronFieldPart(parts[2] ?? "", 1, 31);
  const month = parseCronFieldPart(parts[3] ?? "", 1, 12);
  const dayOfWeek = parseCronFieldPart(parts[4] ?? "", 0, 6);
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return null;
  }

  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

const TIMEZONE_PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getDateTimePartsForTimezone(date: Date, timezone: string) {
  let formatter = TIMEZONE_PARTS_FORMATTER_CACHE.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    TIMEZONE_PARTS_FORMATTER_CACHE.set(timezone, formatter);
  }

  const parts = formatter.formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  const weekdayText = valueByType.get("weekday") ?? "Sun";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    month: Number.parseInt(valueByType.get("month") ?? "1", 10),
    day: Number.parseInt(valueByType.get("day") ?? "1", 10),
    hour: Number.parseInt(valueByType.get("hour") ?? "0", 10),
    minute: Number.parseInt(valueByType.get("minute") ?? "0", 10),
    weekday: weekdayMap[weekdayText] ?? 0,
  };
}

function computeNextRunEstimate(cronExpression: string, timezone: string): Date | null {
  const parsedCron = parseCronExpression(cronExpression);
  if (!parsedCron) {
    return null;
  }

  const cursor = new Date();
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let iteration = 0; iteration < 60 * 24 * 365; iteration += 1) {
    const parts = getDateTimePartsForTimezone(cursor, timezone);
    if (
      parsedCron.minute.has(parts.minute) &&
      parsedCron.hour.has(parts.hour) &&
      parsedCron.dayOfMonth.has(parts.day) &&
      parsedCron.month.has(parts.month) &&
      parsedCron.dayOfWeek.has(parts.weekday)
    ) {
      return new Date(cursor);
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

function describeCronExpression(cronExpression: string): string {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return "Custom schedule";
  }

  const minute = parts[0] ?? "*";
  const hour = parts[1] ?? "*";
  const dayOfMonth = parts[2] ?? "*";
  const month = parts[3] ?? "*";
  const dayOfWeek = parts[4] ?? "*";
  const minuteText = String(minute).padStart(2, "0");
  const hourText = String(hour).padStart(2, "0");

  if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every hour";
  }
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") {
    return `Weekdays at ${hourText}:${minuteText}`;
  }
  if (dayOfMonth === "*" && month === "*" && /^\d$/.test(dayOfWeek)) {
    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weekdayName = weekdayNames[Number.parseInt(dayOfWeek, 10)] ?? `day ${dayOfWeek}`;
    return `Weekly on ${weekdayName} at ${hourText}:${minuteText}`;
  }
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Daily at ${hourText}:${minuteText}`;
  }

  return "Custom schedule";
}

/** Dialog for editing an existing scheduled job's mutable fields. */
export function EditScheduledJobDialogView({ job, open, onClose }: EditScheduledJobDialogViewProps) {
  const { t } = useTranslation();
  const { updateScheduledJob } = useCommands();
  const orgId = sessionStore((state) => state.selectedOrganizationId);
  const projects = workspaceStore((state) => state.projects);
  useDialogRegistration(open);

  const inferred = inferScheduleFromCron(job.cronExpression);
  const [draft, setDraft] = useState<FormDraft>(() => ({
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
  }, [draft.cronExpression, draft.timezone, scheduleType, scheduleTime, weeklyDay]);
  const cronDescription = useMemo(() => describeCronExpression(draft.cronExpression), [draft.cronExpression]);

  const isSubmitDisabled =
    isSaving || !draft.name.trim() || !draft.projectId || !draft.nodeId || !draft.cronExpression.trim() || !draft.prompt.trim();

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
