import { requestJson } from "./restClient";

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

export type UpdateScheduledJobInput = {
  name?: string;
  nodeId?: string;
  agentKind?: string;
  prompt?: string;
  model?: string | null;
  command?: string | null;
  cronExpression?: string;
  timezone?: string;
};

export type CreateScheduledJobInput = {
  name: string;
  projectId: string;
  nodeId: string;
  cronExpression: string;
  prompt: string;
  agentKind?: string;
  model?: string;
  command?: string;
  timezone?: string;
};

/** Lists all scheduled jobs for one organization. */
export async function listScheduledJobs(orgId: string): Promise<ScheduledJobRecord[]> {
  const response = await requestJson<{ jobs: ScheduledJobRecord[] }>(`/orgs/${orgId}/scheduled-jobs`);
  return response.jobs;
}

/** Creates a new scheduled job. */
export async function createScheduledJob(orgId: string, input: CreateScheduledJobInput): Promise<ScheduledJobRecord> {
  const response = await requestJson<{ job: ScheduledJobRecord }>(`/orgs/${orgId}/scheduled-jobs`, {
    method: "POST",
    body: input,
  });
  return response.job;
}

/** Pauses one scheduled job. */
export async function pauseScheduledJob(orgId: string, jobId: string): Promise<ScheduledJobRecord> {
  const response = await requestJson<{ job: ScheduledJobRecord }>(`/orgs/${orgId}/scheduled-jobs/${jobId}/pause`, {
    method: "PUT",
  });
  return response.job;
}

/** Resumes one paused scheduled job. */
export async function resumeScheduledJob(orgId: string, jobId: string): Promise<ScheduledJobRecord> {
  const response = await requestJson<{ job: ScheduledJobRecord }>(`/orgs/${orgId}/scheduled-jobs/${jobId}/resume`, {
    method: "PUT",
  });
  return response.job;
}

/** Lists the most recent runs for one scheduled job (default limit: 20). */
export async function listScheduledJobRuns(orgId: string, jobId: string, limit = 20): Promise<ScheduledJobRunRecord[]> {
  const response = await requestJson<{ runs: ScheduledJobRunRecord[] }>(
    `/orgs/${orgId}/scheduled-jobs/${jobId}/runs?limit=${limit}`,
  );
  return response.runs;
}

/** Updates one scheduled job's editable fields. */
export async function updateScheduledJob(
  orgId: string,
  jobId: string,
  input: UpdateScheduledJobInput,
): Promise<ScheduledJobRecord> {
  const response = await requestJson<{ job: ScheduledJobRecord }>(`/orgs/${orgId}/scheduled-jobs/${jobId}`, {
    method: "PUT",
    body: input,
  });
  return response.job;
}

/** Soft-deletes one scheduled job so it no longer appears in job lists. */
export async function deleteScheduledJob(orgId: string, jobId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/orgs/${orgId}/scheduled-jobs/${jobId}`, {
    method: "DELETE",
  });
}
