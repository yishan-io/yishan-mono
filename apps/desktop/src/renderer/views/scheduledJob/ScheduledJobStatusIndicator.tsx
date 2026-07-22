import { useTranslation } from "react-i18next";
import type { ScheduledJobStatus } from "../../api/scheduledJobApi";
import { StatusIndicator, type StatusIndicatorColor } from "../../components/StatusIndicator";

type ScheduledJobStatusIndicatorVariant = "detail" | "compact";

type ScheduledJobStatusIndicatorProps = {
  /** The scheduled job lifecycle status to present. */
  status: ScheduledJobStatus;
  /** The layout density for the status indicator. Defaults to detail. */
  variant?: ScheduledJobStatusIndicatorVariant;
};

type StatusIndicatorPresentation = {
  dotSize: number;
  gap: number;
  labelColor: "text.primary" | "text.secondary";
};

const STATUS_COLOR_BY_SCHEDULED_JOB_STATUS: Record<ScheduledJobStatus, StatusIndicatorColor> = {
  active: "success",
  paused: "disabled",
  disabled: "disabled",
};

const PRESENTATION_BY_VARIANT: Record<ScheduledJobStatusIndicatorVariant, StatusIndicatorPresentation> = {
  detail: { dotSize: 8, gap: 0.75, labelColor: "text.primary" },
  compact: { dotSize: 7, gap: 0.5, labelColor: "text.secondary" },
};

/** Renders the translated lifecycle status of a scheduled job. */
export function ScheduledJobStatusIndicator({ status, variant = "detail" }: ScheduledJobStatusIndicatorProps) {
  const { t } = useTranslation();
  const presentation = PRESENTATION_BY_VARIANT[variant];

  return (
    <StatusIndicator
      label={t(`scheduledJob.status.${status}`)}
      color={STATUS_COLOR_BY_SCHEDULED_JOB_STATUS[status]}
      {...presentation}
    />
  );
}
