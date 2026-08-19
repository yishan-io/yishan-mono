import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { scheduledJobStore } from "../../../domains/scheduled-job/state/scheduledJobStore";

import { sessionStore } from "@renderer/domains/session";
import type { CreateScheduledJobInput, UpdateScheduledJobInput } from "../api/scheduledJobApi";
import {
  createScheduledJob as createScheduledJobFromApi,
  deleteScheduledJob as deleteScheduledJobFromApi,
  listScheduledJobRuns as listScheduledJobRunsFromApi,
  listScheduledJobs as listScheduledJobsFromApi,
  pauseScheduledJob as pauseScheduledJobFromApi,
  resumeScheduledJob as resumeScheduledJobFromApi,
  runScheduledJobNow as runScheduledJobNowFromApi,
  updateScheduledJob as updateScheduledJobFromApi,
} from "../api/scheduledJobApi";

/**
 * Updates an existing scheduled job and refreshes the store entry on success.
 */
export async function updateScheduledJob(jobId: string, input: UpdateScheduledJobInput): Promise<void> {
  const orgId = sessionStore.getState().selectedOrganizationId;
  if (!orgId) {
    return;
  }

  const updated = await updateScheduledJobFromApi(orgId, jobId, input);
  scheduledJobStore.getState().upsertScheduledJob(updated);
}

/**
 * Soft-deletes one scheduled job by ID and removes it from the store on success.
 */
export async function deleteScheduledJob(jobId: string): Promise<void> {
  const orgId = sessionStore.getState().selectedOrganizationId;
  if (!orgId) {
    return;
  }

  scheduledJobStore.getState().addPendingActionId(jobId);

  try {
    await deleteScheduledJobFromApi(orgId, jobId);
    scheduledJobStore.getState().removeScheduledJob(jobId);
  } finally {
    scheduledJobStore.getState().removePendingActionId(jobId);
  }
}

/**
 * Creates a new scheduled job and adds it to the scheduled job store.
 */
export async function createScheduledJob(input: CreateScheduledJobInput): Promise<void> {
  const orgId = sessionStore.getState().selectedOrganizationId;
  if (!orgId) {
    return;
  }

  const created = await createScheduledJobFromApi(orgId, input);
  scheduledJobStore.getState().upsertScheduledJob(created);
}

/**
 * Fetches scheduled jobs for the currently selected organization and updates
 * the store. Manages load state transitions around the request.
 */
export async function loadScheduledJobs(): Promise<void> {
  const orgId = sessionStore.getState().selectedOrganizationId;
  if (!orgId) {
    return;
  }

  scheduledJobStore.getState().setLoadState("loading");

  try {
    const jobs = await listScheduledJobsFromApi(orgId);
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
  const orgId = sessionStore.getState().selectedOrganizationId;
  if (!orgId) {
    return;
  }

  scheduledJobStore.getState().addPendingActionId(jobId);

  try {
    const updated = await pauseScheduledJobFromApi(orgId, jobId);
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
  const orgId = sessionStore.getState().selectedOrganizationId;
  if (!orgId) {
    return;
  }

  scheduledJobStore.getState().addPendingActionId(jobId);

  try {
    const updated = await resumeScheduledJobFromApi(orgId, jobId);
    scheduledJobStore.getState().upsertScheduledJob(updated);
  } finally {
    scheduledJobStore.getState().removePendingActionId(jobId);
  }
}

/** Triggers one scheduled job immediately. */
export async function runScheduledJobNow(
  jobId: string,
): Promise<import("../scheduledJobTypes").ScheduledJobRunRecord | null> {
  const orgId = sessionStore.getState().selectedOrganizationId;
  if (!orgId) {
    return null;
  }

  scheduledJobStore.getState().addPendingActionId(jobId);

  try {
    return await runScheduledJobNowFromApi(orgId, jobId);
  } finally {
    scheduledJobStore.getState().removePendingActionId(jobId);
  }
}

/** Lists recent runs for one scheduled job (display-only; no store mutation). */
export async function listScheduledJobRuns(
  orgId: string,
  jobId: string,
  limit = 20,
): Promise<import("../scheduledJobTypes").ScheduledJobRunRecord[]> {
  return listScheduledJobRunsFromApi(orgId, jobId, limit);
}

export type {
  ScheduledJobRecord,
  ScheduledJobRunRecord,
  ScheduledJobStatus,
  ScheduledJobLastRunStatus,
  ScheduledJobRunStatus,
} from "../scheduledJobTypes";
export type { CreateScheduledJobInput, UpdateScheduledJobInput } from "../api/scheduledJobApi";
