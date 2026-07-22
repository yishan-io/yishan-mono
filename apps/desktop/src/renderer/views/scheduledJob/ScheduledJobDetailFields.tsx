import { Box, Divider, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import type { ScheduledJobRecord } from "../../api/scheduledJobApi";
import { AgentIcon } from "../../components/AgentIcon";
import { renderProjectIcon } from "../../components/projectIcons";
import { isDesktopAgentKind } from "../../helpers/agentSettings";
import { workspaceStore } from "../../store/workspaceStore";
import { ScheduledJobStatusIndicator } from "./ScheduledJobStatusIndicator";
import { describeCronExpression } from "./scheduledJobDetailHelpers";

type ScheduledJobDetailFieldsProps = {
  job: ScheduledJobRecord;
  orgId: string;
};

type FieldRowProps = { label: string; children: React.ReactNode };

/** Returns a formatted date string or a dash when the value is absent. */
function formatOptionalDate(isoDate: string | null): string {
  if (!isoDate) {
    return "—";
  }
  return new Date(isoDate).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Renders one labelled field row in the detail view. */
function FieldRow({ label, children }: FieldRowProps) {
  return (
    <Box sx={{ display: "flex", gap: 2, py: 1, alignItems: "flex-start" }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, flexShrink: 0, pt: 0.1 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

/** Renders the read-only detail fields for one scheduled job. */
export function ScheduledJobDetailFields({ job, orgId }: ScheduledJobDetailFieldsProps) {
  const { t } = useTranslation();
  const project = workspaceStore((state) =>
    state.projects.find((workspaceProject) => workspaceProject.id === job.projectId),
  );
  const nodeQuery = useQuery({
    queryKey: ["org-nodes", orgId],
    queryFn: () => api.node.listByOrg(orgId),
    enabled: Boolean(orgId),
  });

  const nodeName = nodeQuery.data?.find((node) => node.id === job.nodeId)?.name ?? job.nodeId;

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: 2.5, py: 1.5 }}>
      <Stack divider={<Divider sx={{ borderStyle: "dashed" }} />}>
        <FieldRow label={t("scheduledJob.detail.fields.name")}>
          <Typography variant="body2">{job.name}</Typography>
        </FieldRow>

        <FieldRow label={t("scheduledJob.detail.fields.status")}>
          <ScheduledJobStatusIndicator status={job.status} />
        </FieldRow>

        <FieldRow label={t("scheduledJob.detail.fields.project")}>
          {project ? (
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 16,
                  height: 16,
                  borderRadius: 0.5,
                  bgcolor: project.color ?? "primary.main",
                  color: "common.white",
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {renderProjectIcon(project.icon ?? undefined, 10)}
              </Box>
              <Typography variant="body2">{project.name}</Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.disabled">
              —
            </Typography>
          )}
        </FieldRow>

        <FieldRow label={t("scheduledJob.detail.fields.node")}>
          <Typography variant="body2">{nodeName}</Typography>
        </FieldRow>

        <FieldRow label={t("scheduledJob.detail.fields.cronExpression")}>
          <Box>
            <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
              {job.cronExpression}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {describeCronExpression(job.cronExpression)}
            </Typography>
          </Box>
        </FieldRow>

        <FieldRow label={t("scheduledJob.detail.fields.timezone")}>
          <Typography variant="body2">{job.timezone}</Typography>
        </FieldRow>

        <FieldRow label={t("scheduledJob.detail.fields.agentKind")}>
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
            {isDesktopAgentKind(job.agentKind) ? (
              <AgentIcon agentKind={job.agentKind} context="settingsRow" decorative />
            ) : null}
            <Typography variant="body2">{job.agentKind}</Typography>
          </Box>
        </FieldRow>

        {job.model ? (
          <FieldRow label={t("scheduledJob.detail.fields.model")}>
            <Typography variant="body2">{job.model}</Typography>
          </FieldRow>
        ) : null}

        {job.command ? (
          <FieldRow label={t("scheduledJob.detail.fields.command")}>
            <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
              {job.command}
            </Typography>
          </FieldRow>
        ) : null}

        <FieldRow label={t("scheduledJob.detail.fields.createdAt")}>
          <Typography variant="body2" color="text.secondary">
            {formatOptionalDate(job.createdAt)}
          </Typography>
        </FieldRow>

        <FieldRow label={t("scheduledJob.detail.fields.updatedAt")}>
          <Typography variant="body2" color="text.secondary">
            {formatOptionalDate(job.updatedAt)}
          </Typography>
        </FieldRow>

        <FieldRow label={t("scheduledJob.detail.fields.prompt")}>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {job.prompt}
          </Typography>
        </FieldRow>
      </Stack>
    </Box>
  );
}
