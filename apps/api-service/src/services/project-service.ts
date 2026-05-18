import { and, eq, inArray } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { projects, workspaces } from "@/db/schema";
import type { WorkspacePullRequestState } from "@/db/schema";
import { ProjectNotFoundError } from "@/errors";
import { newId } from "@/lib/id";
import { inferRepoSource } from "@/lib/repo";
import type { OrganizationService } from "@/services/organization-service";
import { assertNodeOwnedByActor } from "@/services/shared/assertNodeOwnedByActor";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";
import { fetchLatestPrByWorkspaceId } from "@/services/workspace-pull-request-service";

type ProjectSourceType = "git" | "git-local" | "unknown";

export type ProjectView = {
  id: string;
  name: string;
  sourceType: ProjectSourceType;
  repoProvider: string | null;
  repoUrl: string | null;
  repoKey: string | null;
  icon: string;
  color: string;
  setupScript: string;
  postScript: string;
  contextEnabled: boolean;
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
    status: "active" | "closed";
    branch: string | null;
    localPath: string;
    latestPullRequest: {
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
    } | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

type CreateProjectInput = {
  organizationId: string;
  actorUserId: string;
  name: string;
  sourceTypeHint?: "unknown" | "git-local" | "git";
  repoUrl?: string;
  nodeId?: string;
  localPath?: string;
};

type UpdateProjectInput = {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  name?: string;
  icon?: string;
  color?: string;
  setupScript?: string;
  postScript?: string;
  contextEnabled?: boolean;
};

export class ProjectService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
  ) {}

  async createProject(input: CreateProjectInput): Promise<ProjectWithWorkspacesView> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

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

    if ((sourceType === "git" || sourceType === "git-local") && nodeId) {
      await assertNodeOwnedByActor(this.db, nodeId, input.actorUserId);
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
          createdByUserId: input.actorUserId,
        })
        .returning();

      const project = insertedRows[0];
      if (!project) {
        throw new Error("Failed to create project");
      }

      const createdWorkspaces: ProjectWithWorkspacesView["workspaces"] = [];

      if ((sourceType === "git" || sourceType === "git-local") && nodeId && localPath) {
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
            localPath,
          })
          .returning();

        createdWorkspaces.push({ ...insertedWorkspaces[0]!, latestPullRequest: null });
      }

      return { ...project, workspaces: createdWorkspaces };
    });
  }

  async listProjects(input: {
    organizationId: string;
    actorUserId: string;
    withWorkspaces?: boolean;
  }): Promise<ProjectView[] | ProjectWithWorkspacesView[]> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

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
          eq(workspaces.status, "active"),
          inArray(workspaces.projectId, projectIds),
        ),
      );

    if (workspaceRows.length === 0) {
      return rows.map((row) => ({ ...row, workspaces: [] }));
    }

    const workspaceIds = workspaceRows.map((w) => w.id);
    const latestPrByWorkspaceId = await fetchLatestPrByWorkspaceId(this.db, input.organizationId, workspaceIds);

    const workspacesByProjectId = new Map<string, ProjectWithWorkspacesView["workspaces"]>();
    for (const workspace of workspaceRows) {
      const existing = workspacesByProjectId.get(workspace.projectId) ?? [];
      const pr = latestPrByWorkspaceId.get(workspace.id) ?? null;
      existing.push({
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
      });
      workspacesByProjectId.set(workspace.projectId, existing);
    }

    return rows.map((row) => ({
      ...row,
      workspaces: workspacesByProjectId.get(row.id) ?? [],
    }));
  }

  async deleteProject(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
  }): Promise<void> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

    const deletedRows = await this.db
      .delete(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, input.organizationId)))
      .returning({ id: projects.id });

    if (deletedRows.length === 0) {
      throw new ProjectNotFoundError(input.projectId);
    }
  }

  async updateProject(input: UpdateProjectInput): Promise<ProjectView> {
    const { organizationId, actorUserId, projectId, ...updates } = input;
    await assertOrganizationMember(this.organizationService, organizationId, actorUserId);

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    ) as Partial<Pick<ProjectView, "name" | "icon" | "color" | "setupScript" | "postScript" | "contextEnabled">>;

    const updatedRows = await this.db
      .update(projects)
      .set({ ...filteredUpdates, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
      .returning();

    const project = updatedRows[0];
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    return project;
  }
}
