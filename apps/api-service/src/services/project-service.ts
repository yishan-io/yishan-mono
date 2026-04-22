import { and, eq } from "drizzle-orm";

import type { AppDb } from "@/db/client";
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
import { inferRepoSource } from "@/lib/repo";
import type { OrganizationService } from "@/services/organization-service";

type ProjectSourceType = "git" | "git-local" | "unknown";
type WorkspaceKind = "primary" | "worktree";

export type ProjectView = {
  id: string;
  name: string;
  sourceType: ProjectSourceType;
  repoProvider: string | null;
  repoUrl: string | null;
  repoKey: string | null;
  organizationId: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

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

type CreateProjectInput = {
  organizationId: string;
  actorUserId: string;
  name: string;
  sourceTypeHint?: "unknown" | "git-local";
  repoUrl?: string;
  nodeId?: string;
  localPath?: string;
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

export class ProjectService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService
  ) {}

  async createProject(input: CreateProjectInput): Promise<ProjectView> {
    const role = await this.organizationService.getMembershipRole({
      organizationId: input.organizationId,
      userId: input.actorUserId
    });

    if (!role) {
      throw new OrganizationMembershipRequiredError();
    }

    const name = input.name.trim();
    const repoUrl = input.repoUrl?.trim() ?? null;
    const sourceType: ProjectSourceType = repoUrl ? "git" : (input.sourceTypeHint ?? "unknown");

    let repoProvider: string | null = null;
    let repoKey: string | null = null;
    const nodeId = input.nodeId?.trim() ?? null;
    const localPath = input.localPath?.trim() ?? null;

    if (sourceType === "git") {
      const inferred = inferRepoSource(repoUrl!);
      repoProvider = inferred.repoProvider;
      repoKey = inferred.repoKey;
    }

    return this.db.transaction(async (tx) => {
      const insertedRows = await tx
        .insert(projects)
        .values({
          id: newId(),
          name,
          sourceType,
          repoProvider,
          repoUrl,
          repoKey,
          organizationId: input.organizationId,
          createdByUserId: input.actorUserId
        })
        .returning();

      const project = insertedRows[0];
      if (!project) {
        throw new Error("Failed to create project");
      }

      if ((sourceType === "git" || sourceType === "git-local") && nodeId && localPath) {
        const nodeRows = await tx
          .select({ id: nodes.id, scope: nodes.scope, ownerUserId: nodes.ownerUserId })
          .from(nodes)
          .where(eq(nodes.id, nodeId!))
          .limit(1);

        const node = nodeRows[0];
        if (!node) {
          throw new WorkspaceNodeNotFoundError(nodeId!);
        }

        if (node.scope !== "local") {
          throw new WorkspaceLocalNodeScopeInvalidError(nodeId!);
        }

        if (node.ownerUserId !== input.actorUserId) {
          throw new WorkspaceLocalNodePermissionRequiredError();
        }

        await tx.insert(workspaces).values({
          id: newId(),
          organizationId: input.organizationId,
          projectId: project.id,
          userId: input.actorUserId,
          nodeId: nodeId!,
          kind: "primary",
          branch: null,
          localPath: localPath!
        });
      }

      return {
        ...project,
        sourceType: project.sourceType as ProjectSourceType
      };
    });
  }

  async listProjects(input: { organizationId: string; actorUserId: string }): Promise<ProjectView[]> {
    const role = await this.organizationService.getMembershipRole({
      organizationId: input.organizationId,
      userId: input.actorUserId
    });

    if (!role) {
      throw new OrganizationMembershipRequiredError();
    }

    const rows = await this.db.select().from(projects).where(eq(projects.organizationId, input.organizationId));

    return rows.map((row) => ({
      ...row,
      sourceType: row.sourceType as ProjectSourceType
    }));
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceView> {
    return this.db.transaction(async (tx) => {
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
