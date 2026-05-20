import type { AgentKind } from "@yishan/core";
import { and, desc, eq, inArray } from "drizzle-orm";

import type { OrganizationMemberRole } from "@/db/schema";

import type { AppDb } from "@/db/client";
import { projects, scheduledJobRuns, scheduledJobs } from "@/db/schema";
import {
  ProjectNotFoundError,
  ScheduledJobInvalidCronError,
  ScheduledJobInvalidTimezoneError,
  ScheduledJobNotFoundError,
} from "@/errors";
import { newId } from "@/lib/id";
import { computeNextRunAt, ensureTimezoneSupported, parseCronExpression } from "@/scheduled/cron";
import type { OrganizationService } from "@/services/organization-service";
import { assertNodeOwnedByActor } from "@/services/shared/assertNodeOwnedByActor";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";

const DEFAULT_RUN_LIMIT = 20;

type ScheduledJobRecord = typeof scheduledJobs.$inferSelect;
type ScheduledJobRunRecord = typeof scheduledJobRuns.$inferSelect;

type JobRunStatus = "pending" | "running" | "succeeded" | "failed" | "skipped_offline";

const SCHEDULED_JOB_VISIBLE_STATUSES = ["active", "paused", "disabled"] as const;

export type ScheduledJobView = {
  id: string;
  organizationId: string;
  projectId: string;
  nodeId: string;
  name: string;
  agentKind: AgentKind;
  prompt: string;
  model: string | null;
  command: string | null;
  cronExpression: string;
  timezone: string;
  status: "active" | "paused" | "disabled";
  nextRunAt: Date;
  lastScheduledFor: Date | null;
  lastRunAt: Date | null;
  lastRunStatus: "succeeded" | "failed" | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ScheduledJobRunView = {
  id: string;
  jobId: string;
  organizationId: string;
  projectId: string;
  nodeId: string;
  scheduledFor: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  status: JobRunStatus;
  responseBody: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
  createdAt: Date;
};

export type PendingRun = {
  runId: string;
  scheduledFor: Date;
  job: ScheduledJobView;
};

export type TriggerNowRun = PendingRun;

type CreateScheduledJobInput = {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  actorRole?: OrganizationMemberRole;
  name: string;
  nodeId: string;
  agentKind?: AgentKind;
  prompt: string;
  model?: string;
  command?: string;
  cronExpression: string;
  timezone?: string;
};

type UpdateScheduledJobInput = {
  organizationId: string;
  jobId: string;
  actorUserId: string;
  actorRole?: OrganizationMemberRole;
  name?: string;
  nodeId?: string;
  agentKind?: AgentKind;
  prompt?: string;
  model?: string | null;
  command?: string | null;
  cronExpression?: string;
  timezone?: string;
};

type JobIdentityInput = {
  organizationId: string;
  jobId: string;
  actorUserId: string;
  actorRole?: OrganizationMemberRole;
};

type ListRunsInput = JobIdentityInput & {
  limit?: number;
};

export function toScheduledJobView(row: ScheduledJobRecord): ScheduledJobView {
  return row as ScheduledJobView;
}

function toRunView(row: ScheduledJobRunRecord): ScheduledJobRunView {
  return {
    id: row.id,
    jobId: row.jobId,
    organizationId: row.organizationId,
    projectId: row.projectId,
    nodeId: row.nodeId,
    scheduledFor: row.scheduledFor,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    status: row.status,
    responseBody: row.responseBody,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    errorDetails:
      row.errorDetails && typeof row.errorDetails === "object" && !Array.isArray(row.errorDetails)
        ? (row.errorDetails as Record<string, unknown>)
        : null,
    createdAt: row.createdAt,
  };
}

function validateCronOrThrow(expression: string) {
  try {
    return parseCronExpression(expression);
  } catch (error) {
    throw new ScheduledJobInvalidCronError(
      expression,
      error instanceof Error ? error.message : "Unknown cron parse error",
    );
  }
}

function validateTimezoneOrThrow(timezone: string): string {
  try {
    return ensureTimezoneSupported(timezone);
  } catch (error) {
    throw new ScheduledJobInvalidTimezoneError(
      timezone,
      error instanceof Error ? error.message : "Unknown timezone validation error",
    );
  }
}

/** Handles HTTP CRUD operations for scheduled jobs. Background evaluation lives in JobEvaluatorService. */
export class ScheduledJobService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
  ) {}

  private async assertOrganizationMember(
    organizationId: string,
    userId: string,
    preResolvedRole?: OrganizationMemberRole,
  ): Promise<void> {
    await assertOrganizationMember(this.organizationService, organizationId, userId, preResolvedRole);
  }

  private async assertProjectBelongsToOrganization(projectId: string, organizationId: string): Promise<void> {
    const rows = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (rows.length === 0) {
      throw new ProjectNotFoundError(projectId);
    }
  }

  private async assertNodeOwnedByActor(nodeId: string, actorUserId: string): Promise<void> {
    await assertNodeOwnedByActor(this.db, nodeId, actorUserId);
  }

  private async getJobOrThrow(jobId: string, organizationId: string): Promise<ScheduledJobRecord> {
    const rows = await this.db
      .select()
      .from(scheduledJobs)
      .where(
        and(
          eq(scheduledJobs.id, jobId),
          eq(scheduledJobs.organizationId, organizationId),
          inArray(scheduledJobs.status, SCHEDULED_JOB_VISIBLE_STATUSES),
        ),
      )
      .limit(1);

    const job = rows[0];
    if (!job) {
      throw new ScheduledJobNotFoundError(jobId);
    }
    return job;
  }

  /**
   * Lightweight existence-and-ownership check — fetches only `id` and `status`.
   * Use when the full job record is not needed (e.g. pause / disable / list runs).
   */
  private async assertJobExistsInOrg(jobId: string, organizationId: string): Promise<void> {
    const rows = await this.db
      .select({ id: scheduledJobs.id })
      .from(scheduledJobs)
      .where(
        and(
          eq(scheduledJobs.id, jobId),
          eq(scheduledJobs.organizationId, organizationId),
          inArray(scheduledJobs.status, SCHEDULED_JOB_VISIBLE_STATUSES),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new ScheduledJobNotFoundError(jobId);
    }
  }

  async createScheduledJob(input: CreateScheduledJobInput): Promise<ScheduledJobView> {
    await this.assertOrganizationMember(input.organizationId, input.actorUserId, input.actorRole);
    // Project-ownership check and node-ownership check are independent — run concurrently.
    await Promise.all([
      this.assertProjectBelongsToOrganization(input.projectId, input.organizationId),
      this.assertNodeOwnedByActor(input.nodeId, input.actorUserId),
    ]);

    const cronExpression = input.cronExpression.trim();
    const timezone = validateTimezoneOrThrow(input.timezone?.trim() || "UTC");
    const parsed = validateCronOrThrow(cronExpression);
    const nextRunAt = computeNextRunAt(parsed, timezone, new Date());

    const rows = await this.db
      .insert(scheduledJobs)
      .values({
        id: newId(),
        organizationId: input.organizationId,
        projectId: input.projectId,
        nodeId: input.nodeId.trim(),
        name: input.name.trim(),
        agentKind: input.agentKind ?? "opencode",
        prompt: input.prompt.trim(),
        model: input.model?.trim() ?? null,
        command: input.command?.trim() ?? null,
        cronExpression,
        timezone,
        status: "active",
        nextRunAt,
        createdByUserId: input.actorUserId,
      })
      .returning();

    const created = rows[0];
    if (!created) {
      throw new Error("Failed to create scheduled job");
    }
    return toScheduledJobView(created);
  }

  async listScheduledJobs(input: {
    organizationId: string;
    projectId?: string;
    actorUserId: string;
    actorRole?: OrganizationMemberRole;
    limit?: number;
  }): Promise<ScheduledJobView[]> {
    await this.assertOrganizationMember(input.organizationId, input.actorUserId, input.actorRole);
    if (input.projectId) {
      await this.assertProjectBelongsToOrganization(input.projectId, input.organizationId);
    }

    const conditions = [
      eq(scheduledJobs.organizationId, input.organizationId),
      inArray(scheduledJobs.status, SCHEDULED_JOB_VISIBLE_STATUSES),
    ];
    if (input.projectId) {
      conditions.push(eq(scheduledJobs.projectId, input.projectId));
    }

    const query = this.db
      .select()
      .from(scheduledJobs)
      .where(and(...conditions))
      .orderBy(desc(scheduledJobs.createdAt));

    const rows = input.limit != null ? await query.limit(input.limit) : await query;

    return rows.map(toScheduledJobView);
  }

  async updateScheduledJob(input: UpdateScheduledJobInput): Promise<ScheduledJobView> {
    await this.assertOrganizationMember(input.organizationId, input.actorUserId, input.actorRole);
    const existing = await this.getJobOrThrow(input.jobId, input.organizationId);
    const nodeId = input.nodeId?.trim() ?? existing.nodeId;
    if (input.nodeId !== undefined) {
      await this.assertNodeOwnedByActor(nodeId, input.actorUserId);
    }

    const nextCron = input.cronExpression?.trim() ?? existing.cronExpression;
    const nextTimezone = validateTimezoneOrThrow((input.timezone ?? existing.timezone).trim());
    const parsed = validateCronOrThrow(nextCron);
    const shouldRecomputeNextRun =
      input.cronExpression !== undefined || input.timezone !== undefined || existing.status === "active";
    const nextRunAt = shouldRecomputeNextRun ? computeNextRunAt(parsed, nextTimezone, new Date()) : existing.nextRunAt;

    const rows = await this.db
      .update(scheduledJobs)
      .set({
        name: input.name?.trim() ?? existing.name,
        nodeId,
        agentKind: input.agentKind ?? existing.agentKind,
        prompt: input.prompt?.trim() ?? existing.prompt,
        model: input.model !== undefined ? (input.model?.trim() ?? null) : existing.model,
        command: input.command !== undefined ? (input.command?.trim() ?? null) : existing.command,
        cronExpression: nextCron,
        timezone: nextTimezone,
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(scheduledJobs.id, existing.id))
      .returning();

    const updated = rows[0];
    if (!updated) {
      throw new ScheduledJobNotFoundError(input.jobId);
    }
    return toScheduledJobView(updated);
  }

  async pauseScheduledJob(input: JobIdentityInput): Promise<ScheduledJobView> {
    await this.assertOrganizationMember(input.organizationId, input.actorUserId, input.actorRole);
    await this.assertJobExistsInOrg(input.jobId, input.organizationId);

    const rows = await this.db
      .update(scheduledJobs)
      .set({ status: "paused", updatedAt: new Date() })
      .where(and(eq(scheduledJobs.id, input.jobId), eq(scheduledJobs.organizationId, input.organizationId)))
      .returning();

    const updated = rows[0];
    if (!updated) {
      throw new ScheduledJobNotFoundError(input.jobId);
    }
    return toScheduledJobView(updated);
  }

  async resumeScheduledJob(input: JobIdentityInput): Promise<ScheduledJobView> {
    await this.assertOrganizationMember(input.organizationId, input.actorUserId, input.actorRole);
    const existing = await this.getJobOrThrow(input.jobId, input.organizationId);

    const parsed = validateCronOrThrow(existing.cronExpression);
    const timezone = validateTimezoneOrThrow(existing.timezone);
    const nextRunAt = computeNextRunAt(parsed, timezone, new Date());

    const rows = await this.db
      .update(scheduledJobs)
      .set({ status: "active", nextRunAt, updatedAt: new Date() })
      .where(eq(scheduledJobs.id, existing.id))
      .returning();

    const updated = rows[0];
    if (!updated) {
      throw new ScheduledJobNotFoundError(input.jobId);
    }
    return toScheduledJobView(updated);
  }

  async disableScheduledJob(input: JobIdentityInput): Promise<ScheduledJobView> {
    await this.assertOrganizationMember(input.organizationId, input.actorUserId, input.actorRole);
    await this.assertJobExistsInOrg(input.jobId, input.organizationId);

    const rows = await this.db
      .update(scheduledJobs)
      .set({ status: "disabled", updatedAt: new Date() })
      .where(and(eq(scheduledJobs.id, input.jobId), eq(scheduledJobs.organizationId, input.organizationId)))
      .returning();

    const updated = rows[0];
    if (!updated) {
      throw new ScheduledJobNotFoundError(input.jobId);
    }
    return toScheduledJobView(updated);
  }

  async deleteScheduledJob(input: JobIdentityInput): Promise<void> {
    await this.assertOrganizationMember(input.organizationId, input.actorUserId, input.actorRole);
    await this.assertJobExistsInOrg(input.jobId, input.organizationId);

    await this.db
      .update(scheduledJobs)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(and(eq(scheduledJobs.id, input.jobId), eq(scheduledJobs.organizationId, input.organizationId)));
  }

  async listJobRuns(input: ListRunsInput): Promise<ScheduledJobRunView[]> {
    await this.assertOrganizationMember(input.organizationId, input.actorUserId, input.actorRole);
    await this.assertJobExistsInOrg(input.jobId, input.organizationId);

    const limit = input.limit ?? DEFAULT_RUN_LIMIT;
    const rows = await this.db
      .select()
      .from(scheduledJobRuns)
      .where(and(eq(scheduledJobRuns.jobId, input.jobId), eq(scheduledJobRuns.organizationId, input.organizationId)))
      .orderBy(desc(scheduledJobRuns.scheduledFor))
      .limit(limit);

    return rows.map(toRunView);
  }

  async triggerRunNow(input: JobIdentityInput): Promise<TriggerNowRun> {
    await this.assertOrganizationMember(input.organizationId, input.actorUserId, input.actorRole);
    const job = await this.getJobOrThrow(input.jobId, input.organizationId);

    const scheduledFor = new Date();
    const runId = newId();

    await this.db.insert(scheduledJobRuns).values({
      id: runId,
      jobId: job.id,
      organizationId: job.organizationId,
      projectId: job.projectId,
      nodeId: job.nodeId,
      scheduledFor,
      status: "pending",
    });

    return {
      runId,
      scheduledFor,
      job: toScheduledJobView(job),
    };
  }
}
