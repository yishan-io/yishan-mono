import { and, eq, inArray, sql } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { projectLocalTaskKeyAllocations, projectLocalTaskKeyCounters, projects, workspaces } from "@/db/schema";
import type { ProjectSourceType, WorkspaceStatus } from "@/db/schema";
import {
  LocalTaskKeyAllocationFailedError,
  ProjectAlreadyExistsError,
  ProjectCreateFailedError,
  ProjectNotFoundError,
  ProjectTaskPrefixAllocationExhaustedError,
  ProjectTaskPrefixAlreadyExistsError,
  ProjectTaskPrefixEnsureFailedError,
} from "@/errors";
import { newId } from "@/lib/id";
import { inferRepoSource } from "@/lib/repo";
import { buildLegacyTaskPrefixCandidates } from "@/services/local-task-key-prefix";
import type { OrganizationService } from "@/services/organization-service";
import { assertNodeOwnedByActor } from "@/services/shared/assertNodeOwnedByActor";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";
import { fetchLatestPrByWorkspaceId } from "@/services/workspace-pull-request-service";
import type { WorkspacePullRequestSummary } from "@/services/workspace-service";

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
  commands: Array<{ name: string; command: string }>;
  contextEnabled: boolean;
  taskPrefix: string | null;
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
    status: WorkspaceStatus;
    branch: string | null;
    sourceBranch: string | null;
    localPath: string;
    latestPullRequest: WorkspacePullRequestSummary | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

type CreateProjectInput = {
  organizationId: string;
  actorUserId: string;
  name: string;
  taskPrefix: string;
  sourceTypeHint?: "unknown" | "git-local" | "git";
  repoUrl?: string;
  nodeId?: string;
  localPath?: string;
  contextEnabled?: boolean;
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
  commands?: Array<{ name: string; command: string }>;
  contextEnabled?: boolean;
};

type PostgresErrorDetails = {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
};

type AppDbTransaction = Parameters<AppDb["transaction"]>[0] extends (tx: infer Transaction) => Promise<unknown>
  ? Transaction
  : never;

function hasProjectGitIdentityUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as PostgresErrorDetails;
  return postgresError.code === "23505" && postgresError.constraint === "projects_org_repo_provider_key_uq";
}

function hasProjectTaskPrefixUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as PostgresErrorDetails;
  return postgresError.code === "23505" && postgresError.constraint === "projects_org_task_prefix_uq";
}

function isProjectTaskPrefixUniqueViolation(error: unknown): boolean {
  if (hasProjectTaskPrefixUniqueViolation(error)) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  return hasProjectTaskPrefixUniqueViolation((error as PostgresErrorDetails).cause);
}

function isProjectGitIdentityUniqueViolation(error: unknown): boolean {
  if (hasProjectGitIdentityUniqueViolation(error)) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  return hasProjectGitIdentityUniqueViolation((error as PostgresErrorDetails).cause);
}

export class ProjectService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
  ) {}

  async createProject(input: CreateProjectInput): Promise<ProjectWithWorkspacesView> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

    const name = input.name.trim();
    const taskPrefix = input.taskPrefix.trim();
    const repoUrl = input.repoUrl?.trim() ?? null;
    const sourceType: ProjectSourceType = repoUrl ? "git" : (input.sourceTypeHint ?? "unknown");

    let repoProvider: string | null = null;
    let repoKey: string | null = null;
    const nodeId = input.nodeId?.trim() ?? null;
    const localPath = input.localPath?.trim() ?? null;

    if (sourceType === "git" && repoUrl) {
      const inferred = inferRepoSource(repoUrl);
      repoProvider = inferred.repoProvider;
      repoKey = inferred.repoKey;
    }

    if (nodeId) {
      await assertNodeOwnedByActor(this.db, nodeId, input.actorUserId);
    }

    try {
      return await this.db.transaction(async (tx) => {
        await this.lockOrganizationProjectPrefixes(tx, input.organizationId);

        let insertedRows: (typeof projects.$inferSelect)[];
        try {
          insertedRows = await tx
            .insert(projects)
            .values({
              id: newId(),
              name,
              sourceType,
              repoProvider,
              repoUrl,
              repoKey,
              contextEnabled: input.contextEnabled ?? true,
              taskPrefix,
              organizationId: input.organizationId,
              createdByUserId: input.actorUserId,
            })
            .returning();
        } catch (error) {
          if (isProjectTaskPrefixUniqueViolation(error)) {
            throw new ProjectTaskPrefixAlreadyExistsError(input.organizationId, taskPrefix);
          }
          if (isProjectGitIdentityUniqueViolation(error)) {
            throw new ProjectAlreadyExistsError({
              organizationId: input.organizationId,
              repoProvider,
              repoKey,
            });
          }
          throw new ProjectCreateFailedError(error);
        }

        const project = insertedRows[0];
        if (!project) {
          throw new ProjectCreateFailedError();
        }

        const createdWorkspaces: ProjectWithWorkspacesView["workspaces"] = [];

        if (nodeId && localPath) {
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

          const createdPrimaryWorkspace = insertedWorkspaces[0];
          if (createdPrimaryWorkspace) {
            createdWorkspaces.push({ ...createdPrimaryWorkspace, latestPullRequest: null });
          }
        }

        return { ...project, workspaces: createdWorkspaces };
      });
    } catch (error) {
      if (
        error instanceof ProjectAlreadyExistsError ||
        error instanceof ProjectTaskPrefixAlreadyExistsError ||
        error instanceof ProjectCreateFailedError
      ) {
        throw error;
      }
      throw new ProjectCreateFailedError(error);
    }
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
          inArray(workspaces.status, ["active", "provisioning"]),
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

  /** Ensures a legacy project has its immutable, organization-unique task prefix. */
  async ensureProjectTaskPrefix(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
  }): Promise<ProjectView> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

    try {
      return await this.db.transaction(async (tx) => {
        await this.lockOrganizationProjectPrefixes(tx, input.organizationId);
        const organizationProjects = await tx
          .select()
          .from(projects)
          .where(eq(projects.organizationId, input.organizationId))
          .for("update");
        const project = organizationProjects.find((candidate) => candidate.id === input.projectId);
        if (!project) {
          throw new ProjectNotFoundError(input.projectId);
        }

        const taskPrefixResult = await this.backfillTaskPrefix(tx, input.organizationId, project, organizationProjects);
        return taskPrefixResult.project ?? { ...project, taskPrefix: taskPrefixResult.taskPrefix };
      });
    } catch (error) {
      if (error instanceof ProjectNotFoundError || error instanceof ProjectTaskPrefixAllocationExhaustedError) {
        throw error;
      }
      throw new ProjectTaskPrefixEnsureFailedError(error);
    }
  }

  /** Allocates an idempotent API-owned Local Task key within a project. */
  async allocateLocalTaskKey(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
    localTaskId: string;
  }): Promise<{ key: string }> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);

    try {
      return await this.db.transaction(async (tx) => {
        await this.lockOrganizationProjectPrefixes(tx, input.organizationId);

        const organizationProjects = await tx
          .select({ id: projects.id, name: projects.name, taskPrefix: projects.taskPrefix })
          .from(projects)
          .where(eq(projects.organizationId, input.organizationId))
          .for("update");
        const project = organizationProjects.find((candidate) => candidate.id === input.projectId);
        if (!project) {
          throw new ProjectNotFoundError(input.projectId);
        }

        const existingAllocations = await tx
          .select({ key: projectLocalTaskKeyAllocations.key })
          .from(projectLocalTaskKeyAllocations)
          .where(
            and(
              eq(projectLocalTaskKeyAllocations.projectId, input.projectId),
              eq(projectLocalTaskKeyAllocations.localTaskId, input.localTaskId),
            ),
          )
          .limit(1);
        const existingAllocation = existingAllocations[0];
        if (existingAllocation) {
          return existingAllocation;
        }

        const { taskPrefix } = await this.backfillTaskPrefix(tx, input.organizationId, project, organizationProjects);
        const counterRows = await tx
          .insert(projectLocalTaskKeyCounters)
          .values({ projectId: input.projectId, lastAllocatedNumber: 1 })
          .onConflictDoUpdate({
            target: projectLocalTaskKeyCounters.projectId,
            set: { lastAllocatedNumber: sql`${projectLocalTaskKeyCounters.lastAllocatedNumber} + 1` },
          })
          .returning({ lastAllocatedNumber: projectLocalTaskKeyCounters.lastAllocatedNumber });
        const sequenceNumber = counterRows[0]?.lastAllocatedNumber;
        if (sequenceNumber === undefined) {
          throw new LocalTaskKeyAllocationFailedError("project");
        }

        const key = `${taskPrefix}-${sequenceNumber}`;
        await tx.insert(projectLocalTaskKeyAllocations).values({
          projectId: input.projectId,
          localTaskId: input.localTaskId,
          key,
          sequenceNumber,
        });
        return { key };
      });
    } catch (error) {
      if (error instanceof ProjectNotFoundError || error instanceof ProjectTaskPrefixAllocationExhaustedError) {
        throw error;
      }
      if (error instanceof LocalTaskKeyAllocationFailedError) {
        throw error;
      }
      throw new LocalTaskKeyAllocationFailedError("project", error);
    }
  }

  private async lockOrganizationProjectPrefixes(tx: AppDbTransaction, organizationId: string): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`);
  }

  private async backfillTaskPrefix(
    tx: AppDbTransaction,
    organizationId: string,
    project: { id: string; name: string; taskPrefix: string | null },
    organizationProjects: Array<{ id: string; name: string; taskPrefix: string | null }>,
  ): Promise<{ taskPrefix: string; project?: ProjectView }> {
    if (project.taskPrefix) {
      return { taskPrefix: project.taskPrefix };
    }

    const assignedPrefixes = new Set(
      organizationProjects.flatMap((organizationProject) =>
        organizationProject.taskPrefix ? [organizationProject.taskPrefix] : [],
      ),
    );
    const taskPrefix = buildLegacyTaskPrefixCandidates(project.name, project.id).find(
      (candidate) => !assignedPrefixes.has(candidate),
    );
    if (!taskPrefix) {
      throw new ProjectTaskPrefixAllocationExhaustedError(project.id);
    }

    const updatedProjects = await tx
      .update(projects)
      .set({ taskPrefix, updatedAt: new Date() })
      .where(and(eq(projects.id, project.id), eq(projects.organizationId, organizationId)))
      .returning();
    const updatedProject = updatedProjects[0];
    if (!updatedProject) {
      throw new ProjectNotFoundError(project.id);
    }
    return { taskPrefix, project: updatedProject };
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
    ) as Partial<
      Pick<ProjectView, "name" | "icon" | "color" | "setupScript" | "postScript" | "commands" | "contextEnabled">
    >;

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
