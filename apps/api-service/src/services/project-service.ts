import { and, eq, inArray } from "drizzle-orm";

import type { AppDb, AppDbWs } from "@/db/client";
import { nodes, projects, workspaces } from "@/db/schema";
import {
  OrganizationMembershipRequiredError,
  ProjectNotFoundError,
  WorkspaceLocalNodePermissionRequiredError,
  WorkspaceLocalNodeScopeInvalidError,
  WorkspaceNodeNotFoundError
} from "@/errors";
import { newId } from "@/lib/id";
import { inferRepoSource } from "@/lib/repo";
import type { OrganizationService } from "@/services/organization-service";

type ProjectSourceType = "git" | "git-local" | "unknown";

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

export type ProjectWithWorkspacesView = ProjectView & {
  workspaces: Array<{
    id: string;
    organizationId: string;
    projectId: string;
    userId: string;
    nodeId: string;
    kind: "primary" | "worktree";
    branch: string | null;
    localPath: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
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

export class ProjectService {
  constructor(
    private readonly db: AppDb,
    private readonly dbWs: AppDbWs,
    private readonly organizationService: OrganizationService
  ) {}

  async createProject(input: CreateProjectInput): Promise<ProjectWithWorkspacesView> {
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

    return this.dbWs.transaction(async (tx) => {
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

      const createdWorkspaces: ProjectWithWorkspacesView["workspaces"] = [];

      if ((sourceType === "git" || sourceType === "git-local") && nodeId && localPath) {
        const nodeRows = await tx
          .select({ id: nodes.id, scope: nodes.scope, ownerUserId: nodes.ownerUserId })
          .from(nodes)
          .where(eq(nodes.id, nodeId))
          .limit(1);

        const node = nodeRows[0];
        if (!node) {
          throw new WorkspaceNodeNotFoundError(nodeId);
        }

        if (node.scope !== "private") {
          throw new WorkspaceLocalNodeScopeInvalidError(nodeId);
        }

        if (node.ownerUserId !== input.actorUserId) {
          throw new WorkspaceLocalNodePermissionRequiredError();
        }

        const insertedWorkspaces = await tx
          .insert(workspaces)
          .values({
            id: newId(),
            organizationId: input.organizationId,
            projectId: project.id,
            userId: input.actorUserId,
            nodeId,
            kind: "primary",
            branch: null,
            localPath
          })
          .returning();

        createdWorkspaces.push(...insertedWorkspaces);
      }

      return {
        ...project,
        workspaces: createdWorkspaces
      };
    });
  }

  async listProjects(input: {
    organizationId: string;
    actorUserId: string;
    withWorkspaces?: boolean;
  }): Promise<ProjectView[] | ProjectWithWorkspacesView[]> {
    const role = await this.organizationService.getMembershipRole({
      organizationId: input.organizationId,
      userId: input.actorUserId
    });

    if (!role) {
      throw new OrganizationMembershipRequiredError();
    }

    const rows = await this.db.select().from(projects).where(eq(projects.organizationId, input.organizationId));

    if (!input.withWorkspaces) {
      return rows;
    }

    if (rows.length === 0) {
      return [];
    }

    const projectIds = rows.map((project) => project.id);
    const workspaceRows = await this.db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, input.organizationId),
          eq(workspaces.userId, input.actorUserId),
          inArray(workspaces.projectId, projectIds)
        )
      );

    const workspacesByProjectId = new Map<string, ProjectWithWorkspacesView["workspaces"]>();
    for (const workspace of workspaceRows) {
      const existing = workspacesByProjectId.get(workspace.projectId) ?? [];
      existing.push(workspace);
      workspacesByProjectId.set(workspace.projectId, existing);
    }

    return rows.map((row) => ({
      ...row,
      workspaces: workspacesByProjectId.get(row.id) ?? []
    }));
  }

  async deleteProject(input: { organizationId: string; projectId: string; actorUserId: string }): Promise<void> {
    const role = await this.organizationService.getMembershipRole({
      organizationId: input.organizationId,
      userId: input.actorUserId
    });

    if (!role) {
      throw new OrganizationMembershipRequiredError();
    }

    const deletedRows = await this.dbWs
      .delete(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, input.organizationId)))
      .returning({ id: projects.id });

    if (deletedRows.length === 0) {
      throw new ProjectNotFoundError(input.projectId);
    }
  }
}
