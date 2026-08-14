import { and, eq, inArray, isNull } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { organizationMembers, projects, workspaces } from "@/db/schema";
import type { WorkspaceKind, WorkspacePullRequestState, WorkspaceStatus } from "@/db/schema";
import {
  PrimaryWorkspaceCloseNotAllowedError,
  ProjectNotFoundError,
  WorkspaceAlreadyExistsError,
  WorkspaceBranchRequiredError,
  WorkspaceCreateFailedError,
  WorkspaceNodeNotFoundError,
  WorkspaceNotFoundError,
} from "@/errors";
import { newId } from "@/lib/id";
import type { OrganizationService } from "@/services/organization-service";
import { assertNodeOwnedByActor } from "@/services/shared/assertNodeOwnedByActor";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";
import type { WorkspaceProvisioner } from "@/services/workspace-provisioner";
import { fetchLatestPrByWorkspaceId } from "@/services/workspace-pull-request-service";

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
  status: WorkspaceStatus;
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
  localPath?: string;
};

type CloseWorkspaceInput = {
  workspaceId: string;
  organizationId: string;
  actorUserId: string;
  projectId: string;
};

export type CloseWorkspaceResult = {
  workspace: WorkspaceView;
  changed: boolean;
};

type UpdateWorkspaceInput = {
  workspaceId: string;
  organizationId: string;
  actorUserId: string;
  projectId: string;
  localPath: string;
};

function isWorkspaceLiveUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown; constraint?: unknown };
  return record.code === "23505" && record.constraint === "workspaces_project_user_node_kind_branch_uq";
}

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

      const existingLiveRows = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.organizationId, input.organizationId),
            eq(workspaces.projectId, input.projectId),
            eq(workspaces.userId, input.actorUserId),
            eq(workspaces.nodeId, input.nodeId),
            eq(workspaces.kind, input.kind),
            branch ? eq(workspaces.branch, branch) : isNull(workspaces.branch),
            inArray(workspaces.status, ["active", "provisioning"]),
          ),
        )
        .limit(1);

      if (existingLiveRows.length > 0) {
        throw new WorkspaceAlreadyExistsError({
          projectId: input.projectId,
          nodeId: input.nodeId,
          kind: input.kind,
          branch,
        });
      }

      const sourceBranch = input.sourceBranch?.trim() ?? null;
      const localPath = input.localPath?.trim() ?? "";
      const status: WorkspaceStatus = localPath ? "active" : "provisioning";

      try {
        const insertedRows = await tx
          .insert(workspaces)
          .values({
            // Honor a client-supplied ID (the daemon generates it for local/remote
            // creates so local and remote records stay aligned); otherwise generate
            // one here.
            id: input.id?.trim() || newId(),
            organizationId: input.organizationId,
            projectId: input.projectId,
            userId: input.actorUserId,
            nodeId: input.nodeId,
            kind: input.kind,
            branch,
            sourceBranch,
            localPath,
            status,
          })
          .returning();

        const workspace = insertedRows[0];
        if (!workspace) {
          throw new WorkspaceCreateFailedError();
        }

        return workspace;
      } catch (error) {
        if (isWorkspaceLiveUniqueViolation(error)) {
          throw new WorkspaceAlreadyExistsError({
            projectId: input.projectId,
            nodeId: input.nodeId,
            kind: input.kind,
            branch,
          });
        }
        throw error;
      }
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
          inArray(workspaces.status, ["active", "provisioning"]),
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

  async closeWorkspace(input: CloseWorkspaceInput): Promise<CloseWorkspaceResult> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

    const existingRows = await this.db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, input.organizationId),
          eq(workspaces.projectId, input.projectId),
          eq(workspaces.userId, input.actorUserId),
          eq(workspaces.id, input.workspaceId),
        ),
      )
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new WorkspaceNotFoundError({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      });
    }
    if (existing.kind === "primary") {
      throw new PrimaryWorkspaceCloseNotAllowedError(input.workspaceId);
    }

    if (existing.status === "closed") {
      return {
        workspace: { ...existing, latestPullRequest: null },
        changed: false,
      };
    }

    const rows = await this.db
      .update(workspaces)
      .set({ status: "closed", updatedAt: new Date() })
      .where(
        and(
          eq(workspaces.organizationId, input.organizationId),
          eq(workspaces.projectId, input.projectId),
          eq(workspaces.userId, input.actorUserId),
          eq(workspaces.id, input.workspaceId),
          inArray(workspaces.status, ["active", "provisioning"]),
        ),
      )
      .returning();

    const workspace = rows[0];
    if (!workspace) {
      const currentRows = await this.db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.organizationId, input.organizationId),
            eq(workspaces.projectId, input.projectId),
            eq(workspaces.userId, input.actorUserId),
            eq(workspaces.id, input.workspaceId),
          ),
        )
        .limit(1);

      const current = currentRows[0];
      if (!current) {
        throw new WorkspaceNotFoundError({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        });
      }

      return {
        workspace: { ...current, latestPullRequest: null },
        changed: false,
      };
    }

    return {
      workspace: { ...workspace, latestPullRequest: null },
      changed: true,
    };
  }

  async updateWorkspace(input: UpdateWorkspaceInput): Promise<WorkspaceView> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

    const localPath = input.localPath.trim();

    const rows = await this.db
      .update(workspaces)
      .set({ status: "active", localPath, updatedAt: new Date() })
      .where(
        and(
          eq(workspaces.id, input.workspaceId),
          eq(workspaces.organizationId, input.organizationId),
          eq(workspaces.projectId, input.projectId),
          eq(workspaces.userId, input.actorUserId),
          eq(workspaces.status, "provisioning"),
        ),
      )
      .returning();

    const updated = rows[0];
    if (!updated) {
      const existingRows = await this.db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, input.workspaceId),
            eq(workspaces.organizationId, input.organizationId),
            eq(workspaces.projectId, input.projectId),
            eq(workspaces.userId, input.actorUserId),
          ),
        )
        .limit(1);

      const existing = existingRows[0];
      if (!existing) {
        throw new WorkspaceNotFoundError({ workspaceId: input.workspaceId, projectId: input.projectId });
      }
      // Already active (idempotent) — return current state.
      return { ...existing, latestPullRequest: null };
    }

    return { ...updated, latestPullRequest: null };
  }
}
