import { and, desc, eq, inArray } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { workspacePullRequests, workspaces } from "@/db/schema";
import type { WorkspacePullRequestState } from "@/db/schema";
import { WorkspaceNotFoundError } from "@/errors";
import { newId } from "@/lib/id";
import type { OrganizationService } from "@/services/organization-service";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";

export type WorkspacePullRequestView = {
  id: string;
  workspaceId: string;
  organizationId: string;
  prId: string;
  title: string | null;
  url: string | null;
  branch: string | null;
  baseBranch: string | null;
  state: WorkspacePullRequestState;
  metadata: unknown;
  detectedAt: Date;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type UpsertWorkspacePullRequestInput = {
  organizationId: string;
  actorUserId: string;
  workspaceId: string;
  prId: string;
  title?: string;
  url?: string;
  branch?: string;
  baseBranch?: string;
  state: WorkspacePullRequestState;
  metadata?: unknown;
  detectedAt: Date;
  resolvedAt?: Date;
};

type ListWorkspacePullRequestsInput = {
  organizationId: string;
  actorUserId: string;
  workspaceId: string;
};

/**
 * Returns the latest pull-request row for each workspace in `workspaceIds`,
 * keyed by workspace ID. Used by workspace and project list queries.
 */
export async function fetchLatestPrByWorkspaceId(
  db: AppDb,
  organizationId: string,
  workspaceIds: string[],
): Promise<Map<string, WorkspacePullRequestView>> {
  if (workspaceIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectDistinctOn([workspacePullRequests.workspaceId], {
      id: workspacePullRequests.id,
      workspaceId: workspacePullRequests.workspaceId,
      organizationId: workspacePullRequests.organizationId,
      prId: workspacePullRequests.prId,
      title: workspacePullRequests.title,
      url: workspacePullRequests.url,
      branch: workspacePullRequests.branch,
      baseBranch: workspacePullRequests.baseBranch,
      state: workspacePullRequests.state,
      metadata: workspacePullRequests.metadata,
      detectedAt: workspacePullRequests.detectedAt,
      resolvedAt: workspacePullRequests.resolvedAt,
      createdAt: workspacePullRequests.createdAt,
      updatedAt: workspacePullRequests.updatedAt,
    })
    .from(workspacePullRequests)
    .where(
      and(
        eq(workspacePullRequests.organizationId, organizationId),
        inArray(workspacePullRequests.workspaceId, workspaceIds),
      ),
    )
    .orderBy(workspacePullRequests.workspaceId, desc(workspacePullRequests.detectedAt));

  return new Map(rows.map((row) => [row.workspaceId, row]));
}

export class WorkspacePullRequestService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
  ) {}

  async upsertWorkspacePullRequest(input: UpsertWorkspacePullRequestInput): Promise<WorkspacePullRequestView> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

    const workspaceRows = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.organizationId, input.organizationId)))
      .limit(1);

    if (workspaceRows.length === 0) {
      throw new WorkspaceNotFoundError({
        projectId: "",
        nodeId: "",
        kind: "primary",
        branch: null,
        localPath: "",
      });
    }

    const now = new Date();
    const resolvedAt = input.resolvedAt ?? (input.state === "closed" || input.state === "merged" ? now : null);

    const rows = await this.db
      .insert(workspacePullRequests)
      .values({
        id: newId(),
        workspaceId: input.workspaceId,
        organizationId: input.organizationId,
        prId: input.prId,
        title: input.title ?? null,
        url: input.url ?? null,
        branch: input.branch ?? null,
        baseBranch: input.baseBranch ?? null,
        state: input.state,
        metadata: input.metadata ?? null,
        detectedAt: input.detectedAt,
        resolvedAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [workspacePullRequests.workspaceId, workspacePullRequests.prId],
        set: {
          title: input.title ?? null,
          url: input.url ?? null,
          branch: input.branch ?? null,
          baseBranch: input.baseBranch ?? null,
          state: input.state,
          metadata: input.metadata ?? null,
          resolvedAt,
          updatedAt: now,
        },
      })
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error("Failed to upsert workspace pull request");
    }

    return row;
  }

  async listWorkspacePullRequests(input: ListWorkspacePullRequestsInput): Promise<WorkspacePullRequestView[]> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

    return this.db
      .select()
      .from(workspacePullRequests)
      .where(
        and(
          eq(workspacePullRequests.workspaceId, input.workspaceId),
          eq(workspacePullRequests.organizationId, input.organizationId),
        ),
      )
      .orderBy(desc(workspacePullRequests.detectedAt));
  }
}
