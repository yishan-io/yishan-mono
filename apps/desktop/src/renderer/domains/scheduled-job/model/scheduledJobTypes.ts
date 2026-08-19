/**
 * Scheduled-job feature view-model types (D15).
 *
 * Structural mirrors of the transport DTOs in `api/scheduledJobApi`. The
 * Scheduled-job Store owns these types so the State layer does not import
 * transport implementations (R6). Shapes are identical to the DTOs, so no
 * runtime conversion is required.
 */

/** Matches ScheduledJobView.status from the api-service. */
export type ScheduledJobStatus = "active" | "paused" | "disabled";

/** Matches ScheduledJobView.lastRunStatus from the api-service. */
export type ScheduledJobLastRunStatus = "succeeded" | "failed" | null;

/**
 * Wire shape of one scheduled job as returned by the api-service.
 * Field names and nullability exactly match ScheduledJobView serialised to JSON.
 */
export type ScheduledJobRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  nodeId: string;
  name: string;
  agentKind: string;
  prompt: string;
  model: string | null;
  command: string | null;
  cronExpression: string;
  timezone: string;
  status: ScheduledJobStatus;
  /** ISO 8601 string. Always present — computed at create/resume time. */
  nextRunAt: string;
  lastScheduledFor: string | null;
  lastRunAt: string | null;
  lastRunStatus: ScheduledJobLastRunStatus;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

/** The status of one scheduled job run. Matches ScheduledJobRunView.status. */
export type ScheduledJobRunStatus = "pending" | "running" | "succeeded" | "failed" | "skipped_offline";

/**
 * Wire shape of one scheduled job run as returned by the api-service.
 * Field names and nullability exactly match ScheduledJobRunView serialised to JSON.
 */
export type ScheduledJobRunRecord = {
  id: string;
  jobId: string;
  organizationId: string;
  projectId: string;
  nodeId: string;
  scheduledFor: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: ScheduledJobRunStatus;
  responseBody: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
  createdAt: string;
};
