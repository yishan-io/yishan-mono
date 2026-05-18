import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type { NodeParamsInput } from "@/validation/node";
import type {
  CompleteScheduledJobRunBodyInput,
  CreateScheduledJobBodyInput,
  ScheduledJobListQueryInput,
  ScheduledJobOrgParamsInput,
  ScheduledJobParamsInput,
  ScheduledJobRunsQueryInput,
  StartScheduledJobRunBodyInput,
  UpdateScheduledJobBodyInput,
} from "@/validation/scheduled-job";

export async function listScheduledJobsHandler(
  c: AppContext,
  params: ScheduledJobOrgParamsInput,
  query: ScheduledJobListQueryInput,
) {
  const actorUser = c.get("sessionUser");
  const jobs = await c.get("services").scheduledJob.listScheduledJobs({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: query.projectId,
  });

  return c.json({ jobs });
}

export async function createScheduledJobHandler(
  c: AppContext,
  params: ScheduledJobOrgParamsInput,
  body: CreateScheduledJobBodyInput,
) {
  const actorUser = c.get("sessionUser");
  const job = await c.get("services").scheduledJob.createScheduledJob({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: body.projectId,
    name: body.name,
    nodeId: body.nodeId,
    agentKind: body.agentKind,
    prompt: body.prompt,
    model: body.model,
    command: body.command,
    cronExpression: body.cronExpression,
    timezone: body.timezone,
  });

  return c.json({ job }, StatusCodes.CREATED);
}

export async function updateScheduledJobHandler(
  c: AppContext,
  params: ScheduledJobParamsInput,
  body: UpdateScheduledJobBodyInput,
) {
  const actorUser = c.get("sessionUser");
  const job = await c.get("services").scheduledJob.updateScheduledJob({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    jobId: params.jobId,
    name: body.name,
    nodeId: body.nodeId,
    agentKind: body.agentKind,
    prompt: body.prompt,
    model: body.model,
    command: body.command,
    cronExpression: body.cronExpression,
    timezone: body.timezone,
  });

  return c.json({ job });
}

export async function pauseScheduledJobHandler(c: AppContext, params: ScheduledJobParamsInput) {
  const actorUser = c.get("sessionUser");
  const job = await c.get("services").scheduledJob.pauseScheduledJob({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    jobId: params.jobId,
  });

  return c.json({ job });
}

export async function resumeScheduledJobHandler(c: AppContext, params: ScheduledJobParamsInput) {
  const actorUser = c.get("sessionUser");
  const job = await c.get("services").scheduledJob.resumeScheduledJob({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    jobId: params.jobId,
  });

  return c.json({ job });
}

export async function disableScheduledJobHandler(c: AppContext, params: ScheduledJobParamsInput) {
  const actorUser = c.get("sessionUser");
  const job = await c.get("services").scheduledJob.disableScheduledJob({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    jobId: params.jobId,
  });

  return c.json({ job });
}

export async function listScheduledJobRunsHandler(
  c: AppContext,
  params: ScheduledJobParamsInput,
  query: ScheduledJobRunsQueryInput,
) {
  const actorUser = c.get("sessionUser");
  const runs = await c.get("services").scheduledJob.listJobRuns({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    jobId: params.jobId,
    limit: query.limit,
  });

  return c.json({ runs });
}

export async function startScheduledJobRunHandler(
  c: AppContext,
  params: NodeParamsInput,
  body: StartScheduledJobRunBodyInput,
) {
  const actorUser = c.get("sessionUser");
  await c.get("services").jobEvaluator.markRunStarted({
    actorUserId: actorUser.id,
    nodeId: params.nodeId,
    runId: body.runId,
    startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
  });

  return c.json({ ok: true });
}

export async function completeScheduledJobRunHandler(
  c: AppContext,
  params: NodeParamsInput,
  body: CompleteScheduledJobRunBodyInput,
) {
  const actorUser = c.get("sessionUser");
  await c.get("services").jobEvaluator.completeRun({
    actorUserId: actorUser.id,
    nodeId: params.nodeId,
    runId: body.runId,
    status: body.status,
    finishedAt: body.finishedAt ? new Date(body.finishedAt) : undefined,
    responseBody: body.responseBody,
    errorCode: body.errorCode,
    errorMessage: body.errorMessage,
    errorDetails: body.errorDetails,
  });

  return c.json({ ok: true });
}
