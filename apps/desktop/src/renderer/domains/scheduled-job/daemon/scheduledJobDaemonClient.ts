import { request } from "@renderer/rpc";

// Scheduled jobs are owned and run by the local daemon (scheduledJob.* RPC).

/** A scheduled job's lifecycle status. */
export type ScheduledJobStatus = "active" | "paused" | "disabled";

/** The outcome of a job's most recent run. */
export type ScheduledJobLastRunStatus = "succeeded" | "failed" | null;

/** Wire shape of one scheduled job as returned by the daemon. */
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

/** The status of one scheduled job run. */
export type ScheduledJobRunStatus = "pending" | "running" | "succeeded" | "failed" | "skipped_offline";

/** Wire shape of one scheduled job run as returned by the daemon. */
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
  return (await request("scheduledJob.list", { organizationId: orgId })) as ScheduledJobRecord[];
}

/** Creates a new scheduled job on this daemon's node. */
export async function createScheduledJob(orgId: string, input: CreateScheduledJobInput): Promise<ScheduledJobRecord> {
  return (await request("scheduledJob.create", { organizationId: orgId, ...input })) as ScheduledJobRecord;
}

/** Pauses one scheduled job. */
export async function pauseScheduledJob(orgId: string, jobId: string): Promise<ScheduledJobRecord> {
  return (await request("scheduledJob.pause", { organizationId: orgId, jobId })) as ScheduledJobRecord;
}

/** Resumes one paused scheduled job. */
export async function resumeScheduledJob(orgId: string, jobId: string): Promise<ScheduledJobRecord> {
  return (await request("scheduledJob.resume", { organizationId: orgId, jobId })) as ScheduledJobRecord;
}

/** Lists the most recent runs for one scheduled job (default limit: 20). */
export async function listScheduledJobRuns(orgId: string, jobId: string, limit = 20): Promise<ScheduledJobRunRecord[]> {
  return (await request("scheduledJob.listRuns", { organizationId: orgId, jobId, limit })) as ScheduledJobRunRecord[];
}

/** Updates one scheduled job's editable fields. */
export async function updateScheduledJob(
  orgId: string,
  jobId: string,
  input: UpdateScheduledJobInput,
): Promise<ScheduledJobRecord> {
  return (await request("scheduledJob.update", { organizationId: orgId, jobId, ...input })) as ScheduledJobRecord;
}

/** Deletes one scheduled job and its run history. */
export async function deleteScheduledJob(orgId: string, jobId: string): Promise<void> {
  await request("scheduledJob.delete", { organizationId: orgId, jobId });
}

/** Triggers one scheduled job immediately. */
export async function runScheduledJobNow(orgId: string, jobId: string): Promise<ScheduledJobRunRecord> {
  const response = (await request("scheduledJob.runNow", { organizationId: orgId, jobId })) as {
    run: ScheduledJobRunRecord;
  };
  return response.run;
}
