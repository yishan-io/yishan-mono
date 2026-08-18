import { api } from "../../../api";
import type { CreateScheduledJobInput, UpdateScheduledJobInput } from "../../../api/scheduledJobApi";
import { scheduledJobStore } from "../../../domains/scheduled-job/state/scheduledJobStore";
import { selectSelectedOrganizationId } from "../../../domains/session";
import { getErrorMessage } from "../../../helpers/errorHelpers";

/**
 * Updates an existing scheduled job and refreshes the store entry on success.
 */
export async function updateScheduledJob(jobId: string, input: UpdateScheduledJobInput): Promise<void> {
  const orgId = selectSelectedOrganizationId();
  if (!orgId) {
    return;
  }

  const updated = await api.scheduledJob.update(orgId, jobId, input);
  scheduledJobStore.getState().upsertScheduledJob(updated);
}

/**
 * Soft-deletes one scheduled job by ID and removes it from the store on success.
 */
export async function deleteScheduledJob(jobId: string): Promise<void> {
  const orgId = selectSelectedOrganizationId();
  if (!orgId) {
    return;
  }

  scheduledJobStore.getState().addPendingActionId(jobId);

  try {
    await api.scheduledJob.delete(orgId, jobId);
    scheduledJobStore.getState().removeScheduledJob(jobId);
  } finally {
    scheduledJobStore.getState().removePendingActionId(jobId);
  }
}

/**
 * Creates a new scheduled job and adds it to the scheduled job store.
 */
export async function createScheduledJob(input: CreateScheduledJobInput): Promise<void> {
  const orgId = selectSelectedOrganizationId();
  if (!orgId) {
    return;
  }

  const created = await api.scheduledJob.create(orgId, input);
  scheduledJobStore.getState().upsertScheduledJob(created);
}

/**
 * Fetches scheduled jobs for the currently selected organization and updates
 * the store. Manages load state transitions around the request.
 */
export async function loadScheduledJobs(): Promise<void> {
  const orgId = selectSelectedOrganizationId();
  if (!orgId) {
    return;
  }

  scheduledJobStore.getState().setLoadState("loading");

  try {
    const jobs = await api.scheduledJob.listByOrg(orgId);
    scheduledJobStore.getState().setScheduledJobs(jobs);
    scheduledJobStore.getState().setLoadState("loaded");
  } catch (error) {
    scheduledJobStore.getState().setLoadState("error", getErrorMessage(error));
  }
}

/**
 * Pauses one scheduled job by ID. Marks the job as pending during the
 * request and updates the store entry on success.
 */
export async function pauseScheduledJob(jobId: string): Promise<void> {
  const orgId = selectSelectedOrganizationId();
  if (!orgId) {
    return;
  }

  scheduledJobStore.getState().addPendingActionId(jobId);

  try {
    const updated = await api.scheduledJob.pause(orgId, jobId);
    scheduledJobStore.getState().upsertScheduledJob(updated);
  } finally {
    scheduledJobStore.getState().removePendingActionId(jobId);
  }
}

/**
 * Resumes one paused scheduled job by ID. Marks the job as pending during
 * the request and updates the store entry on success.
 */
export async function resumeScheduledJob(jobId: string): Promise<void> {
  const orgId = selectSelectedOrganizationId();
  if (!orgId) {
    return;
  }

  scheduledJobStore.getState().addPendingActionId(jobId);

  try {
    const updated = await api.scheduledJob.resume(orgId, jobId);
    scheduledJobStore.getState().upsertScheduledJob(updated);
  } finally {
    scheduledJobStore.getState().removePendingActionId(jobId);
  }
}

/** Triggers one scheduled job immediately. */
export async function runScheduledJobNow(
  jobId: string,
): Promise<import("../../../api/scheduledJobApi").ScheduledJobRunRecord | null> {
  const orgId = selectSelectedOrganizationId();
  if (!orgId) {
    return null;
  }

  scheduledJobStore.getState().addPendingActionId(jobId);

  try {
    return await api.scheduledJob.runNow(orgId, jobId);
  } finally {
    scheduledJobStore.getState().removePendingActionId(jobId);
  }
}

/** Lists recent runs for one scheduled job (display-only; no store mutation). */
export async function listScheduledJobRuns(
  orgId: string,
  jobId: string,
  limit = 20,
): Promise<import("../../../api/scheduledJobApi").ScheduledJobRunRecord[]> {
  return api.scheduledJob.listRuns(orgId, jobId, limit);
}

export type {
  CreateScheduledJobInput,
  ScheduledJobRecord,
  ScheduledJobRunRecord,
  ScheduledJobStatus,
  ScheduledJobLastRunStatus,
  ScheduledJobRunStatus,
  UpdateScheduledJobInput,
} from "../../../api/scheduledJobApi";
