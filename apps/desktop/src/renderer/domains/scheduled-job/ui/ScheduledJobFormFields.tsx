import { Avatar, Box, CircularProgress, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { renderProjectIcon } from "@renderer/domains/project";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { LuCloud, LuServer } from "react-icons/lu";
import type { ScheduledJobFormDraft } from "../hooks/useScheduledJobFormState";
import type { ScheduleType } from "../schedule/scheduledJobScheduleRules";
import { ScheduledJobPromptFields } from "./ScheduledJobPromptFields";
import { ScheduledJobScheduleFields } from "./ScheduledJobScheduleFields";

const formGridSx = { display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.8fr 1fr" }, gap: 2 };
const sideColumnSx = { p: 0.5 };
const sectionLabelSx = { mb: 0.75 };
const scheduleSectionTitleSx = { fontWeight: 600 };
const nodeIconSx = { display: "inline-flex", color: "text.secondary" };

type ScheduledJobProjectOption = { id: string; name: string; icon?: string | null; color?: string | null };
type ScheduledJobNodeOption = { id: string; name: string; scope: "private" | "shared" };

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
      <ScheduledJobPromptFields draft={draft} setDraft={setDraft} isBusy={isBusy} />
      <Box sx={sideColumnSx}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="body2" sx={[{ color: "text.secondary" }, sectionLabelSx]}>
              {t("scheduledJob.form.project")}
            </Typography>
            <TextField
              select
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
              <Typography variant="body2" sx={[{ color: "text.secondary" }, sectionLabelSx]}>
                {t("scheduledJob.form.node")}
              </Typography>
              {nodesError ? (
                <Typography variant="caption" color="error">
                  {nodesError}
                </Typography>
              ) : (
                <TextField
                  select
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
          <Divider />
          <Typography variant="body2" sx={[{ color: "text.secondary" }, scheduleSectionTitleSx]}>
            {t("scheduledJob.form.scheduleSection")}
          </Typography>
          <ScheduledJobScheduleFields
            draft={draft}
            setDraft={setDraft}
            scheduleType={scheduleType}
            setScheduleType={setScheduleType}
            weeklyDay={weeklyDay}
            setWeeklyDay={setWeeklyDay}
            scheduleTime={scheduleTime}
            setScheduleTime={setScheduleTime}
            isBusy={isBusy}
            cronDescription={cronDescription}
            nextRunEstimate={nextRunEstimate}
            customCronDescriptionSx={customCronDescriptionSx}
          />
        </Stack>
      </Box>
    </Box>
  );
}

export { SCHEDULE_TYPE_OPTIONS, TIMEZONE_OPTIONS, WEEKDAY_OPTIONS } from "./ScheduledJobScheduleFields";
