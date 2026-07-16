import {
  Autocomplete,
  Avatar,
  Box,
  CircularProgress,
  Divider,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { LuClock3, LuCloud, LuGlobe, LuServer } from "react-icons/lu";
import { AgentIcon } from "../../../components/AgentIcon";
import { VirtualizedListbox } from "../../../components/VirtualizedListbox";
import { renderProjectIcon } from "../../../components/projectIcons";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "../../../helpers/agentSettings";
import {
  SCHEDULE_TYPE_OPTIONS,
  type ScheduleType,
  type ScheduledJobFormDraft,
  TIMEZONE_OPTIONS,
  WEEKDAY_OPTIONS,
} from "../scheduledJobFormHelpers";

type ScheduledJobProjectOption = { id: string; name: string; icon?: string | null; color?: string | null };
type ScheduledJobNodeOption = { id: string; name: string; scope: "private" | "shared" };

const formGridSx = { display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.8fr 1fr" }, gap: 2 };
const sideColumnSx = { p: 0.5 };
const sectionLabelSx = { mb: 0.75 };
const runbookLabelSx = { letterSpacing: "0.08em", fontWeight: 700 };
const scheduleSectionTitleSx = { fontWeight: 600 };
const nodeIconSx = { display: "inline-flex", color: "text.secondary" };
const nextRunEstimateSx = { display: "block", mt: 0.75 };
const timeInputProps = { inputMode: "numeric", pattern: "[0-2][0-9]:[0-5][0-9]" };
const timezoneInputStyle = { marginLeft: 8 };
const nextRunTimeFormat: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

/** Props for the shared scheduled-job form field layout. */
export interface ScheduledJobFormFieldsProps {
  draft: ScheduledJobFormDraft;
  setDraft: Dispatch<SetStateAction<ScheduledJobFormDraft>>;
  scheduleType: ScheduleType;
  setScheduleType: Dispatch<SetStateAction<ScheduleType>>;
  weeklyDay: string;
  setWeeklyDay: Dispatch<SetStateAction<string>>;
  scheduleTime: string;
  setScheduleTime: Dispatch<SetStateAction<string>>;
  projects: ScheduledJobProjectOption[];
  nodes: ScheduledJobNodeOption[];
  isBusy: boolean;
  isNodesLoading: boolean;
  nodesError: string | null;
  cronDescription: string;
  nextRunEstimate: Date | null;
  isProjectEditable: boolean;
  showNodeLabelWhenError: boolean;
  customCronDescriptionSx?: SxProps<Theme>;
}

/** Shared scheduled-job field layout used by both create and edit wrappers. */
export function ScheduledJobFormFields(props: ScheduledJobFormFieldsProps) {
  const { t } = useTranslation();
  const {
    draft,
    setDraft,
    scheduleType,
    setScheduleType,
    weeklyDay,
    setWeeklyDay,
    scheduleTime,
    setScheduleTime,
    projects,
    nodes,
    isBusy,
    isNodesLoading,
    nodesError,
    cronDescription,
    nextRunEstimate,
    isProjectEditable,
    showNodeLabelWhenError,
    customCronDescriptionSx,
  } = props;
  const selectedNodeId = nodes.some((node) => node.id === draft.nodeId) ? draft.nodeId : "";

  return (
    <Box sx={formGridSx}>
      <Stack spacing={1.25}>
        <TextField
          autoFocus
          fullWidth
          disabled={isBusy}
          value={draft.name}
          onChange={(event) => setDraft((previousDraft) => ({ ...previousDraft, name: event.target.value }))}
          placeholder={t("scheduledJob.form.namePlaceholder")}
        />
        <Typography variant="caption" color="text.secondary" sx={runbookLabelSx}>
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
          disabled={isBusy}
          value={draft.prompt}
          onChange={(event) => setDraft((previousDraft) => ({ ...previousDraft, prompt: event.target.value }))}
          placeholder={t("scheduledJob.form.promptPlaceholder")}
        />
      </Stack>

      <Box sx={sideColumnSx}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={sectionLabelSx}>
              {t("scheduledJob.form.project")}
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              disabled={isBusy || !isProjectEditable || projects.length === 0}
              value={draft.projectId}
              onChange={(event) => setDraft((previousDraft) => ({ ...previousDraft, projectId: event.target.value }))}
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

          {nodesError && !showNodeLabelWhenError ? (
            <Typography variant="caption" color="error">
              {nodesError}
            </Typography>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={sectionLabelSx}>
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
                  disabled={isBusy || isNodesLoading || nodes.length === 0}
                  value={selectedNodeId}
                  onChange={(event) => setDraft((previousDraft) => ({ ...previousDraft, nodeId: event.target.value }))}
                  slotProps={{
                    input: { endAdornment: isNodesLoading ? <CircularProgress size={14} sx={{ mr: 2 }} /> : undefined },
                  }}
                >
                  {nodes.map((node) => (
                    <MenuItem key={node.id} value={node.id}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box component="span" sx={nodeIconSx}>
                          {node.scope === "shared" ? <LuCloud size={14} /> : <LuServer size={14} />}
                        </Box>
                        {node.name}
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Box>
          )}

          <Box>
            <Typography variant="body2" color="text.secondary" sx={sectionLabelSx}>
              {t("scheduledJob.form.agentKind")}
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              disabled={isBusy}
              value={draft.agentKind}
              onChange={(event) =>
                setDraft((previousDraft) => ({ ...previousDraft, agentKind: event.target.value as DesktopAgentKind }))
              }
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
          <Typography variant="body2" color="text.secondary" sx={scheduleSectionTitleSx}>
            {t("scheduledJob.form.scheduleSection")}
          </Typography>
          <TextField
            select
            size="small"
            fullWidth
            disabled={isBusy}
            value={scheduleType}
            onChange={(event) => setScheduleType(event.target.value as ScheduleType)}
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
              disabled={isBusy}
              value={weeklyDay}
              onChange={(event) => setWeeklyDay(event.target.value)}
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
              disabled={isBusy}
              type="text"
              value={scheduleTime}
              onChange={(event) => setScheduleTime(event.target.value)}
              placeholder="09:00"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LuClock3 size={16} />
                    </InputAdornment>
                  ),
                },
                htmlInput: timeInputProps,
              }}
            />
          ) : null}

          {scheduleType === "custom" ? (
            <TextField
              size="small"
              fullWidth
              disabled={isBusy}
              value={draft.cronExpression}
              onChange={(event) =>
                setDraft((previousDraft) => ({ ...previousDraft, cronExpression: event.target.value }))
              }
              placeholder={t("scheduledJob.form.cronExpressionPlaceholder")}
            />
          ) : null}
          {scheduleType === "custom" ? (
            <Typography variant="caption" color="text.secondary" sx={customCronDescriptionSx}>
              {cronDescription}
            </Typography>
          ) : null}

          <Autocomplete
            options={TIMEZONE_OPTIONS}
            value={draft.timezone}
            onChange={(_, value) => setDraft((previousDraft) => ({ ...previousDraft, timezone: value ?? "UTC" }))}
            disabled={isBusy}
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
                        <LuGlobe size={16} style={timezoneInputStyle} />
                      </InputAdornment>
                      {params.InputProps.startAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          <Typography variant="caption" color="text.secondary" sx={nextRunEstimateSx}>
            {nextRunEstimate
              ? t("scheduledJob.form.nextRunEstimate", {
                  value: nextRunEstimate.toLocaleString(undefined, {
                    ...nextRunTimeFormat,
                    timeZone: draft.timezone || "UTC",
                  }),
                })
              : t("scheduledJob.form.nextRunEstimateUnavailable")}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
