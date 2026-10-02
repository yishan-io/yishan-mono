import type { AppDb } from "@/db/client";
import { nodes, organizationMembers, scheduledJobRuns, scheduledJobs, workspaces } from "@/db/schema";
import {
  ScheduledJobClaimUnavailableError,
  ScheduledJobInvalidCronError,
  ScheduledJobInvalidTimezoneError,
} from "@/errors";
import { newId } from "@/lib/id";
import { computeNextRunAt, ensureTimezoneSupported, parseCronExpression } from "@/scheduled/cron";
import type { OrganizationService } from "@/services/organization-service";
import { assertNodeOwnedByActor } from "@/services/shared/assertNodeOwnedByActor";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";
import type { AgentKind } from "@yishan-io/core";
import { and, desc, eq, exists } from "drizzle-orm";
const nodeScheduledJobSnapshotColumns = {
  id: scheduledJobs.id,
  organizationId: scheduledJobs.organizationId,
  projectId: scheduledJobs.projectId,
  nodeId: scheduledJobs.nodeId,
  name: scheduledJobs.name,
  agentKind: scheduledJobs.agentKind,
  prompt: scheduledJobs.prompt,
  model: scheduledJobs.model,
  command: scheduledJobs.command,
  cronExpression: scheduledJobs.cronExpression,
  timezone: scheduledJobs.timezone,
  nextRunAt: scheduledJobs.nextRunAt,
};
/** Active scheduled-job data the assigned node needs to schedule and execute work. */
export type NodeScheduledJobSnapshot = {
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
  nextRunAt: Date;
};
/** A successfully claimed scheduled occurrence ready for node execution. */
export type NodeScheduledJobClaim = {
  runId: string;
  scheduledFor: Date;
  projectPath: string;
  job: NodeScheduledJobSnapshot;
};
function getNextRunAtOrThrow(job: NodeScheduledJobSnapshot, now: Date): Date {
  try {
    const timezone = ensureTimezoneSupported(job.timezone);
    const parsed = parseCronExpression(job.cronExpression);
    return computeNextRunAt(parsed, timezone, now);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unsupported timezone:")) {
      throw new ScheduledJobInvalidTimezoneError(job.timezone, error.message);
    }
    if (error instanceof Error && error.message === "Timezone must not be empty") {
      throw new ScheduledJobInvalidTimezoneError(job.timezone, error.message);
    }
    throw new ScheduledJobInvalidCronError(
      job.cronExpression,
      error instanceof Error ? error.message : "Unknown cron parse error",
    );
  }
}

/**
 * Owns node-scoped scheduled-job behavior.
 *
 * Node run lifecycle behavior resides in NodeScheduledJobRunService.
 */
export class NodeScheduledJobService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
  ) {}

  /**
   * Advances missed occurrences except the exact timer occurrences protected by
   * the node, then returns the authoritative active schedule.
   */
  async reconcileScheduledJobs(input: {
    actorUserId: string;
    nodeId: string;
    protectedJobs: Array<{ jobId: string; nextRunAt: Date }>;
    now?: Date;
  }): Promise<NodeScheduledJobSnapshot[]> {
    await assertNodeOwnedByActor(this.db, input.nodeId, input.actorUserId);
    const now = input.now ?? new Date();
    const protectedNextRunAts = new Map(input.protectedJobs.map((job) => [job.jobId, job.nextRunAt.getTime()]));
    const jobs = await this.getAuthorizedActiveJobs(input.nodeId, input.actorUserId);

    await Promise.all(
      jobs.map(async (job) => {
        const isProtected = protectedNextRunAts.get(job.id) === job.nextRunAt.getTime();
        if (isProtected || job.nextRunAt > now) {
          return;
        }
        await this.fastForwardOverdueJob(job, now, input.actorUserId);
      }),
    );

    return this.getAuthorizedActiveJobs(input.nodeId, input.actorUserId);
  }

  /** Claims one due occurrence for its assigned node exactly once. */
  async claimScheduledJob(input: {
    actorUserId: string;
    nodeId: string;
    jobId: string;
    expectedNextRunAt: Date;
    now?: Date;
  }): Promise<NodeScheduledJobClaim> {
    await assertNodeOwnedByActor(this.db, input.nodeId, input.actorUserId);
    const now = input.now ?? new Date();

    return this.db.transaction(async (tx) => {
      const jobRows = await tx
        .select(nodeScheduledJobSnapshotColumns)
        .from(scheduledJobs)
        .where(and(eq(scheduledJobs.id, input.jobId), eq(scheduledJobs.nodeId, input.nodeId)))
        .limit(1);
      const job = jobRows[0];
      if (!job) {
        throw new ScheduledJobClaimUnavailableError();
      }

      await assertOrganizationMember(this.organizationService, job.organizationId, input.actorUserId);
      const dueAt = job.nextRunAt;
      if (dueAt.getTime() !== input.expectedNextRunAt.getTime()) {
        throw new ScheduledJobClaimUnavailableError();
      }
      const dueGraceExpiresAt = new Date(dueAt.getTime() + 60_000);
      if (now < dueAt || now > dueGraceExpiresAt) {
        throw new ScheduledJobClaimUnavailableError();
      }

      const nextRunAt = getNextRunAtOrThrow(job, now);
      const claimedRows = await tx
        .update(scheduledJobs)
        .set({ nextRunAt, lastScheduledFor: dueAt, updatedAt: now })
        .where(
          and(
            eq(scheduledJobs.id, job.id),
            eq(scheduledJobs.nodeId, input.nodeId),
            eq(scheduledJobs.status, "active"),
            eq(scheduledJobs.nextRunAt, input.expectedNextRunAt),
            exists(
              tx
                .select({ id: nodes.id })
                .from(nodes)
                .where(
                  and(eq(nodes.id, input.nodeId), eq(nodes.scope, "private"), eq(nodes.ownerUserId, input.actorUserId)),
                ),
            ),
            exists(
              tx
                .select({ id: organizationMembers.id })
                .from(organizationMembers)
                .where(
                  and(
                    eq(organizationMembers.organizationId, job.organizationId),
                    eq(organizationMembers.userId, input.actorUserId),
                  ),
                ),
            ),
          ),
        )
        .returning(nodeScheduledJobSnapshotColumns);
      const claimedJob = claimedRows[0];
      if (!claimedJob) {
        throw new ScheduledJobClaimUnavailableError();
      }

      const runId = newId();
      const insertedRuns = await tx
        .insert(scheduledJobRuns)
        .values({
          id: runId,
          jobId: claimedJob.id,
          organizationId: claimedJob.organizationId,
          projectId: claimedJob.projectId,
          nodeId: claimedJob.nodeId,
          scheduledFor: dueAt,
          trigger: "schedule",
          status: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: scheduledJobRuns.id });
      const insertedRun = insertedRuns[0];
      if (!insertedRun) {
        throw new ScheduledJobClaimUnavailableError();
      }

      const workspaceRows = await tx
        .select({ localPath: workspaces.localPath })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.projectId, claimedJob.projectId),
            eq(workspaces.nodeId, input.nodeId),
            eq(workspaces.kind, "primary"),
            eq(workspaces.status, "active"),
          ),
        )
        .orderBy(desc(workspaces.updatedAt))
        .limit(1);

      return {
        runId: insertedRun.id,
        scheduledFor: dueAt,
        projectPath: workspaceRows[0]?.localPath ?? "",
        job: claimedJob,
      };
    });
  }

  private async getAuthorizedActiveJobs(nodeId: string, actorUserId: string): Promise<NodeScheduledJobSnapshot[]> {
    return this.db
      .select(nodeScheduledJobSnapshotColumns)
      .from(scheduledJobs)
      .innerJoin(
        nodes,
        and(
          eq(nodes.id, scheduledJobs.nodeId),
          eq(nodes.id, nodeId),
          eq(nodes.scope, "private"),
          eq(nodes.ownerUserId, actorUserId),
        ),
      )
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, scheduledJobs.organizationId),
          eq(organizationMembers.userId, actorUserId),
        ),
      )
      .where(and(eq(scheduledJobs.nodeId, nodeId), eq(scheduledJobs.status, "active")));
  }

  private async fastForwardOverdueJob(
    job: NodeScheduledJobSnapshot,
    now: Date,
    actorUserId: string,
  ): Promise<NodeScheduledJobSnapshot | null> {
    if (job.nextRunAt > now) {
      return job;
    }

    const nextRunAt = getNextRunAtOrThrow(job, now);
    const rows = await this.db
      .update(scheduledJobs)
      .set({ nextRunAt, updatedAt: now })
      .where(
        and(
          eq(scheduledJobs.id, job.id),
          eq(scheduledJobs.nodeId, job.nodeId),
          eq(scheduledJobs.status, "active"),
          eq(scheduledJobs.nextRunAt, job.nextRunAt),
          exists(
            this.db
              .select({ id: nodes.id })
              .from(nodes)
              .where(and(eq(nodes.id, job.nodeId), eq(nodes.scope, "private"), eq(nodes.ownerUserId, actorUserId))),
          ),
          exists(
            this.db
              .select({ id: organizationMembers.id })
              .from(organizationMembers)
              .where(
                and(
                  eq(organizationMembers.organizationId, job.organizationId),
                  eq(organizationMembers.userId, actorUserId),
                ),
              ),
          ),
        ),
      )
      .returning(nodeScheduledJobSnapshotColumns);

    return rows[0] ?? null;
  }
}
