import { and, eq, isNull } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { organizationMembers, projects, workspaces } from "@/db/schema";
import type { WorkspacePullRequestState } from "@/db/schema";
import {
  ProjectNotFoundError,
  WorkspaceBranchRequiredError,
  WorkspaceNodeNotFoundError,
  WorkspaceNotFoundError,
} from "@/errors";
import { newId } from "@/lib/id";
import type { OrganizationService } from "@/services/organization-service";
import { assertNodeOwnedByActor } from "@/services/shared/assertNodeOwnedByActor";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";
import type { WorkspaceProvisioner } from "@/services/workspace-provisioner";
import { fetchLatestPrByWorkspaceId } from "@/services/workspace-pull-request-service";

type WorkspaceKind = "primary" | "worktree";

export type WorkspacePullRequestSummary = {
  id: string;
  prId: string;
  title: string | null;
  url: string | null;
  branch: string | null;
  baseBranch: string | null;
  state: WorkspacePullRequestState;
  metadata: unknown;
  detectedAt: Date;
  resolvedAt: Date | null;
};

export type WorkspaceView = {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  nodeId: string;
  kind: WorkspaceKind;
  status: "active" | "closed";
  branch: string | null;
  sourceBranch: string | null;
  localPath: string;
  latestPullRequest: WorkspacePullRequestSummary | null;
  createdAt: Date;
  updatedAt: Date;
};

type CreateWorkspaceInput = {
  id?: string;
  organizationId: string;
  actorUserId: string;
  projectId: string;
  nodeId: string;
  kind: WorkspaceKind;
  branch?: string;
  sourceBranch?: string;
  localPath: string;
};

type CloseWorkspaceInput = {
  organizationId: string;
  actorUserId: string;
  projectId: string;
  nodeId: string;
  kind: WorkspaceKind;
  branch?: string;
  localPath: string;
};

export class WorkspaceService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
    private readonly workspaceProvisioner: WorkspaceProvisioner,
  ) {}

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceView> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);
    await assertNodeOwnedByActor(this.db, input.nodeId, input.actorUserId);

    const workspaceRow = await this.db.transaction(async (tx) => {
      const branch = input.branch?.trim() ?? null;
      if (input.kind === "worktree" && !branch) {
        throw new WorkspaceBranchRequiredError();
      }

      const projectRows = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, input.organizationId)))
        .limit(1);

      if (projectRows.length === 0) {
        throw new ProjectNotFoundError(input.projectId);
      }

      const ownerMembershipRows = await tx
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.userId, input.actorUserId),
          ),
        )
        .limit(1);

      if (ownerMembershipRows.length === 0) {
        throw new WorkspaceNodeNotFoundError(input.nodeId);
      }

      const reactivatedRows = await tx
        .update(workspaces)
        .set({ status: "active", localPath: input.localPath.trim(), updatedAt: new Date() })
        .where(
          and(
            eq(workspaces.organizationId, input.organizationId),
            eq(workspaces.projectId, input.projectId),
            eq(workspaces.userId, input.actorUserId),
            eq(workspaces.nodeId, input.nodeId),
            eq(workspaces.kind, input.kind),
            branch ? eq(workspaces.branch, branch) : isNull(workspaces.branch),
            eq(workspaces.status, "closed"),
          ),
        )
        .returning();

      const reactivatedWorkspace = reactivatedRows[0];
      if (reactivatedWorkspace) {
        return reactivatedWorkspace;
      }

      const sourceBranch = input.sourceBranch?.trim() ?? null;

      const insertedRows = await tx
        .insert(workspaces)
        .values({
          id: input.id?.trim() || newId(),
          organizationId: input.organizationId,
          projectId: input.projectId,
          userId: input.actorUserId,
          nodeId: input.nodeId,
          kind: input.kind,
          branch,
          sourceBranch,
          localPath: input.localPath.trim(),
        })
        .returning();

      const workspace = insertedRows[0];
      if (!workspace) {
        throw new Error("Failed to create workspace");
      }

      return workspace;
    });

    await this.workspaceProvisioner.enqueueWorkspaceProvision({
      workspace: workspaceRow,
      actorUserId: input.actorUserId,
    });

    return { ...workspaceRow, latestPullRequest: null };
  }

  async listWorkspaces(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
  }): Promise<WorkspaceView[]> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

    const rows = await this.db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, input.organizationId),
          eq(workspaces.projectId, input.projectId),
          eq(workspaces.userId, input.actorUserId),
          eq(workspaces.status, "active"),
        ),
      );

    if (rows.length === 0) {
      return [];
    }

    const workspaceIds = rows.map((w) => w.id);
    const latestPrByWorkspaceId = await fetchLatestPrByWorkspaceId(this.db, input.organizationId, workspaceIds);

    return rows.map((workspace) => {
      const pr = latestPrByWorkspaceId.get(workspace.id) ?? null;
      return {
        ...workspace,
        latestPullRequest: pr
          ? {
              id: pr.id,
              prId: pr.prId,
              title: pr.title,
              url: pr.url,
              branch: pr.branch,
              baseBranch: pr.baseBranch,
              state: pr.state,
              metadata: pr.metadata,
              detectedAt: pr.detectedAt,
              resolvedAt: pr.resolvedAt,
            }
          : null,
      };
    });
  }

  async closeWorkspace(input: CloseWorkspaceInput): Promise<WorkspaceView> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

    const branch = input.branch?.trim() ?? null;
    if (input.kind === "worktree" && !branch) {
      throw new WorkspaceBranchRequiredError();
    }

    const rows = await this.db
      .update(workspaces)
      .set({ status: "closed", updatedAt: new Date() })
      .where(
        and(
          eq(workspaces.organizationId, input.organizationId),
          eq(workspaces.projectId, input.projectId),
          eq(workspaces.userId, input.actorUserId),
          eq(workspaces.nodeId, input.nodeId),
          eq(workspaces.kind, input.kind),
          branch ? eq(workspaces.branch, branch) : isNull(workspaces.branch),
          eq(workspaces.localPath, input.localPath.trim()),
        ),
      )
      .returning();

    const workspace = rows[0];
    if (!workspace) {
      throw new WorkspaceNotFoundError({
        projectId: input.projectId,
        nodeId: input.nodeId,
        kind: input.kind,
        branch,
        localPath: input.localPath,
      });
    }

    return { ...workspace, latestPullRequest: null };
  }
}
