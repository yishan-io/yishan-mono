import type { AppDb } from "@/db/client";
import { nodes, organizationMembers, scheduledJobRuns, scheduledJobs } from "@/db/schema";
import { ScheduledJobRunTransitionUnavailableError } from "@/errors";
import type { OrganizationService } from "@/services/organization-service";
import { assertNodeOwnedByActor } from "@/services/shared/assertNodeOwnedByActor";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";
import { and, eq, exists, inArray, isNull, lte, or } from "drizzle-orm";

function hasSameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left, sortJsonKeys) === JSON.stringify(right, sortJsonKeys);
}

function sortJsonKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).sort());
}

/** Owns node-authorized scheduled-job run lifecycle behavior. */
export class NodeScheduledJobRunService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
  ) {}

  /** Starts a node-authorized run without allowing an inactive recurring job to execute. */
  async markRunStarted(input: {
    actorUserId: string;
    nodeId: string;
    runId: string;
    startedAt?: Date;
  }): Promise<boolean> {
    await assertNodeOwnedByActor(this.db, input.nodeId, input.actorUserId);
    return await this.db.transaction(async (tx) => {
      const readRun = () =>
        tx
          .select({
            id: scheduledJobRuns.id,
            organizationId: scheduledJobRuns.organizationId,
            trigger: scheduledJobRuns.trigger,
            status: scheduledJobRuns.status,
          })
          .from(scheduledJobRuns)
          .where(and(eq(scheduledJobRuns.id, input.runId), eq(scheduledJobRuns.nodeId, input.nodeId)))
          .limit(1);
      const run = (await readRun())[0];
      if (!run) {
        throw new ScheduledJobRunTransitionUnavailableError();
      }
      await assertOrganizationMember(this.organizationService, run.organizationId, input.actorUserId);
      if (run.status === "running") {
        return false;
      }
      const startedRuns = await tx
        .update(scheduledJobRuns)
        .set({ status: "running", startedAt: input.startedAt ?? new Date() })
        .where(
          and(
            eq(scheduledJobRuns.id, input.runId),
            eq(scheduledJobRuns.nodeId, input.nodeId),
            eq(scheduledJobRuns.status, "pending"),
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
                    eq(organizationMembers.organizationId, scheduledJobRuns.organizationId),
                    eq(organizationMembers.userId, input.actorUserId),
                  ),
                ),
            ),
            // Run Now remains valid after pause; recurring runs require their active assigned parent.
            or(
              eq(scheduledJobRuns.trigger, "manual"),
              exists(
                tx
                  .select({ id: scheduledJobs.id })
                  .from(scheduledJobs)
                  .where(
                    and(
                      eq(scheduledJobs.id, scheduledJobRuns.jobId),
                      eq(scheduledJobs.nodeId, input.nodeId),
                      eq(scheduledJobs.status, "active"),
                    ),
                  ),
              ),
            ),
          ),
        )
        .returning({ id: scheduledJobRuns.id });
      if (startedRuns[0]) {
        return true;
      }
      await assertNodeOwnedByActor(this.db, input.nodeId, input.actorUserId);
      await assertOrganizationMember(this.organizationService, run.organizationId, input.actorUserId);
      const currentRun = (await readRun())[0];
      if (currentRun?.status === "running") {
        await assertOrganizationMember(this.organizationService, currentRun.organizationId, input.actorUserId);
        return false;
      }
      throw new ScheduledJobRunTransitionUnavailableError();
    });
  }
  /** Records one terminal run result and updates its parent summary in the same transaction. */
  async completeRun(input: {
    actorUserId: string;
    nodeId: string;
    runId: string;
    status: "succeeded" | "failed";
    finishedAt?: Date;
    responseBody?: string;
    errorCode?: string;
    errorMessage?: string;
    errorDetails?: Record<string, unknown>;
  }): Promise<{ accepted: boolean }> {
    await assertNodeOwnedByActor(this.db, input.nodeId, input.actorUserId);
    return await this.db.transaction(async (tx) => {
      const readRun = () =>
        tx
          .select({
            id: scheduledJobRuns.id,
            jobId: scheduledJobRuns.jobId,
            organizationId: scheduledJobRuns.organizationId,
            status: scheduledJobRuns.status,
            trigger: scheduledJobRuns.trigger,
            responseBody: scheduledJobRuns.responseBody,
            errorCode: scheduledJobRuns.errorCode,
            errorMessage: scheduledJobRuns.errorMessage,
            errorDetails: scheduledJobRuns.errorDetails,
          })
          .from(scheduledJobRuns)
          .where(and(eq(scheduledJobRuns.id, input.runId), eq(scheduledJobRuns.nodeId, input.nodeId)))
          .limit(1);
      const run = (await readRun())[0];
      if (!run) {
        throw new ScheduledJobRunTransitionUnavailableError();
      }
      await assertOrganizationMember(this.organizationService, run.organizationId, input.actorUserId);
      const finishedAt = input.finishedAt ?? new Date();
      const responseBody = input.responseBody ?? null;
      const errorCode = input.errorCode ?? null;
      const errorMessage = input.errorMessage ?? null;
      const errorDetails = input.errorDetails ?? null;
      const completedRuns = await tx
        .update(scheduledJobRuns)
        .set({ status: input.status, finishedAt, responseBody, errorCode, errorMessage, errorDetails })
        .where(
          and(
            eq(scheduledJobRuns.id, input.runId),
            eq(scheduledJobRuns.nodeId, input.nodeId),
            inArray(scheduledJobRuns.status, ["pending", "running"]),
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
                    eq(organizationMembers.organizationId, scheduledJobRuns.organizationId),
                    eq(organizationMembers.userId, input.actorUserId),
                  ),
                ),
            ),
          ),
        )
        .returning({ jobId: scheduledJobRuns.jobId });
      const completedRun = completedRuns[0];
      if (completedRun) {
        await tx
          .update(scheduledJobs)
          .set({
            lastRunAt: finishedAt,
            lastRunStatus: input.status,
            lastErrorCode: input.status === "failed" ? errorCode : null,
            lastErrorMessage: input.status === "failed" ? errorMessage : null,
            updatedAt: finishedAt,
          })
          .where(
            and(
              eq(scheduledJobs.id, completedRun.jobId),
              or(isNull(scheduledJobs.lastRunAt), lte(scheduledJobs.lastRunAt, finishedAt)),
            ),
          );
        return { accepted: true };
      }
      await assertNodeOwnedByActor(this.db, input.nodeId, input.actorUserId);
      await assertOrganizationMember(this.organizationService, run.organizationId, input.actorUserId);
      const currentRun = (await readRun())[0];
      if (!currentRun) {
        throw new ScheduledJobRunTransitionUnavailableError();
      }
      await assertOrganizationMember(this.organizationService, currentRun.organizationId, input.actorUserId);
      const isSameTerminalResult =
        currentRun.status === input.status &&
        currentRun.responseBody === responseBody &&
        currentRun.errorCode === errorCode &&
        currentRun.errorMessage === errorMessage &&
        hasSameJsonValue(currentRun.errorDetails, errorDetails);
      if (isSameTerminalResult) {
        return { accepted: true };
      }
      const isScheduledTerminalResult =
        currentRun.trigger === "schedule" &&
        (currentRun.status === "succeeded" ||
          currentRun.status === "failed" ||
          currentRun.status === "skipped_offline");
      if (isScheduledTerminalResult) {
        return { accepted: false };
      }
      throw new ScheduledJobRunTransitionUnavailableError();
    });
  }
}
