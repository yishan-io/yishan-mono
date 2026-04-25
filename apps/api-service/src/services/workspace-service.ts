import { and, eq } from "drizzle-orm";

import type { AppDb, AppDbWs } from "@/db/client";
import { nodes, organizationMembers, projects, workspaces } from "@/db/schema";
import {
  OrganizationMembershipRequiredError,
  ProjectNotFoundError,
  WorkspaceBranchRequiredError,
  WorkspaceLocalNodePermissionRequiredError,
  WorkspaceLocalNodeScopeInvalidError,
  WorkspaceNodeNotFoundError
} from "@/errors";
import { newId } from "@/lib/id";
import type { OrganizationService } from "@/services/organization-service";
import type { WorkspaceProvisioner } from "@/services/workspace-provisioner";

type WorkspaceKind = "primary" | "worktree";

export type WorkspaceView = {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  nodeId: string;
  kind: WorkspaceKind;
  branch: string | null;
  localPath: string;
  createdAt: Date;
  updatedAt: Date;
};

type CreateWorkspaceInput = {
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
    private readonly dbWs: AppDbWs,
    private readonly organizationService: OrganizationService,
    private readonly workspaceProvisioner: WorkspaceProvisioner
  ) {}

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceView> {
    const workspace = await this.dbWs.transaction(async (tx) => {
      const role = await this.organizationService.getMembershipRole({
        organizationId: input.organizationId,
        userId: input.actorUserId
      });

      if (!role) {
        throw new OrganizationMembershipRequiredError();
      }

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

      const nodeRows = await tx
        .select({ id: nodes.id, scope: nodes.scope, ownerUserId: nodes.ownerUserId })
        .from(nodes)
        .where(eq(nodes.id, input.nodeId))
        .limit(1);

      const node = nodeRows[0];
      if (!node) {
        throw new WorkspaceNodeNotFoundError(input.nodeId);
      }

      if (node.scope !== "local") {
        throw new WorkspaceLocalNodeScopeInvalidError(input.nodeId);
      }

      if (node.ownerUserId !== input.actorUserId) {
        throw new WorkspaceLocalNodePermissionRequiredError();
      }

      const ownerMembershipRows = await tx
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.userId, input.actorUserId)
          )
        )
        .limit(1);

      if (ownerMembershipRows.length === 0) {
        throw new WorkspaceNodeNotFoundError(input.nodeId);
      }

      const insertedRows = await tx
        .insert(workspaces)
        .values({
          id: newId(),
          organizationId: input.organizationId,
          projectId: input.projectId,
          userId: input.actorUserId,
          nodeId: input.nodeId,
          kind: input.kind,
          branch,
          localPath: input.localPath.trim()
        })
        .returning();

      const workspace = insertedRows[0];
      if (!workspace) {
        throw new Error("Failed to create workspace");
      }

      return {
        ...workspace,
        kind: workspace.kind as WorkspaceKind
      };
    });

    await this.workspaceProvisioner.enqueueWorkspaceProvision({
      workspace,
      actorUserId: input.actorUserId
    });

    return workspace;
  }

  async listWorkspaces(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
  }): Promise<WorkspaceView[]> {
    const role = await this.organizationService.getMembershipRole({
      organizationId: input.organizationId,
      userId: input.actorUserId
    });

    if (!role) {
      throw new OrganizationMembershipRequiredError();
    }

    const projectRows = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, input.organizationId)))
      .limit(1);

    if (projectRows.length === 0) {
      throw new ProjectNotFoundError(input.projectId);
    }

    const rows = await this.db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, input.organizationId),
          eq(workspaces.projectId, input.projectId),
          eq(workspaces.userId, input.actorUserId)
        )
      );

    return rows.map((row) => ({
      ...row,
      kind: row.kind as WorkspaceKind
    }));
  }
}
