import { and, eq, isNull } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { organizationMembers, projects, workspaces } from "@/db/schema";
import type { Workspace, WorkspaceKind, WorkspacePullRequestState } from "@/db/schema";
import {
  PrimaryWorkspaceCloseNotAllowedError,
  ProjectNotFoundError,
  RelayUnavailableError,
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
import { type WorkspaceRelayDeps, resolveWorkspaceRelayAccess } from "@/services/workspace-relay";
import {
  type WorkspaceFileContentView,
  type WorkspaceFileDiffView,
  type WorkspaceFileView,
  type WorkspaceGitBranchListView,
  type WorkspaceGitChangesView,
  type WorkspaceRelayConnectionView,
  listWorkspaceFilesViaRelay,
  listWorkspaceGitBranchesViaRelay,
  listWorkspaceGitChangesViaRelay,
  readWorkspaceDiffViaRelay,
  readWorkspaceFileViaRelay,
} from "@/services/workspace-relay-operations";
import {
  type WorkspaceCurrentPullRequestView,
  refreshWorkspacePullRequestViaRelay,
} from "@/services/workspace-relay-pull-request-operations";
import {
  type WorkspaceTerminalSessionView,
  type WorkspaceTerminalStartView,
  listWorkspaceTerminalSessionsViaRelay,
  startWorkspaceTerminalViaRelay,
  stopWorkspaceTerminalViaRelay,
} from "@/services/workspace-relay-terminal-operations";
import type { ServiceConfig } from "@/types";

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

export type {
  WorkspaceFileContentView,
  WorkspaceFileDiffView,
  WorkspaceFileView,
  WorkspaceGitBranchListView,
  WorkspaceGitChangeKind,
  WorkspaceGitChangeView,
  WorkspaceGitChangesView,
  WorkspaceRelayConnectionView,
} from "@/services/workspace-relay-operations";
export type { WorkspaceCurrentPullRequestView } from "@/services/workspace-relay-pull-request-operations";
export type {
  WorkspaceTerminalSessionView,
  WorkspaceTerminalStartView,
} from "@/services/workspace-relay-terminal-operations";

type CreateWorkspaceInput = {
  id?: string;
  organizationId: string;
  actorUserId: string;
  projectId: string;
  nodeId: string;
  kind: WorkspaceKind;
  name?: string;
  branch?: string;
  sourceBranch?: string;
  localPath: string;
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

type WorkspaceCreateProjectRecord = {
  id: string;
  contextEnabled: boolean;
  repoKey: string | null;
  setupScript: string;
};

type WorkspaceCreateMutationResult = {
  project: WorkspaceCreateProjectRecord;
  workspace: Workspace;
  change: "existing" | "inserted" | "reactivated";
  previousWorkspace: Workspace | null;
};

function isWorkspaceCreateConflictError(error: unknown): error is { code: string } {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505"
  );
}

export class WorkspaceService {
  constructor(
    private readonly db: AppDb,
    private readonly organizationService: OrganizationService,
    private readonly workspaceProvisioner: WorkspaceProvisioner,
    private readonly config?: ServiceConfig,
  ) {}

  async resolveRelayAccess(input: {
    actorUserId: string;
    organizationId: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceRelayConnectionView> {
    return resolveWorkspaceRelayAccess({
      ...this.getRelayDeps(),
      ...input,
    });
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceView> {
    await assertOrganizationMember(this.organizationService, input.organizationId, input.actorUserId);
    await assertNodeOwnedByActor(this.db, input.nodeId, input.actorUserId);

    const branch = input.branch?.trim() ?? null;
    if (input.kind === "worktree" && !branch) {
      throw new WorkspaceBranchRequiredError();
    }

    const sourceBranch = input.sourceBranch?.trim() ?? null;
    const requestedLocalPath = input.localPath.trim();
    const requestedWorkspaceName = input.name?.trim() || branch || null;

    let mutationResult: WorkspaceCreateMutationResult;
    try {
      mutationResult = await this.db.transaction(async (tx) => {
        const projectRows = await tx
          .select({
            id: projects.id,
            contextEnabled: projects.contextEnabled,
            repoKey: projects.repoKey,
            setupScript: projects.setupScript,
          })
          .from(projects)
          .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, input.organizationId)))
          .limit(1);

        const project = projectRows[0];
        if (!project) {
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

        const activeWorkspace = await this.findExistingWorkspaceForCreate(tx, {
          actorUserId: input.actorUserId,
          branch,
          kind: input.kind,
          nodeId: input.nodeId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          status: "active",
        });
        if (activeWorkspace) {
          return {
            change: "existing",
            previousWorkspace: null,
            project,
            workspace: activeWorkspace,
          } satisfies WorkspaceCreateMutationResult;
        }

        const closedWorkspace = await this.findExistingWorkspaceForCreate(tx, {
          actorUserId: input.actorUserId,
          branch,
          kind: input.kind,
          nodeId: input.nodeId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          status: "closed",
        });
        if (closedWorkspace) {
          const reactivatedRows = await tx
            .update(workspaces)
            .set({
              status: "active",
              sourceBranch,
              localPath: requestedLocalPath,
              updatedAt: new Date(),
            })
            .where(eq(workspaces.id, closedWorkspace.id))
            .returning();

          const reactivatedWorkspace = reactivatedRows[0];
          if (!reactivatedWorkspace) {
            throw new WorkspaceCreateFailedError("reactivate-returned-empty");
          }

          return {
            change: "reactivated",
            previousWorkspace: closedWorkspace,
            project,
            workspace: reactivatedWorkspace,
          } satisfies WorkspaceCreateMutationResult;
        }

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
            localPath: requestedLocalPath,
          })
          .returning();

        const workspace = insertedRows[0];
        if (!workspace) {
          throw new WorkspaceCreateFailedError("insert-returned-empty");
        }

        return {
          change: "inserted",
          previousWorkspace: null,
          project,
          workspace,
        } satisfies WorkspaceCreateMutationResult;
      });
    } catch (error) {
      if (!isWorkspaceCreateConflictError(error)) {
        throw error;
      }

      const existingWorkspace = await this.findExistingWorkspaceForCreate(this.db, {
        actorUserId: input.actorUserId,
        branch,
        kind: input.kind,
        nodeId: input.nodeId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        status: "active",
      });
      if (!existingWorkspace) {
        throw new WorkspaceCreateFailedError("workspace-create-conflict");
      }

      return { ...existingWorkspace, latestPullRequest: null };
    }

    if (mutationResult.change === "existing") {
      return { ...mutationResult.workspace, latestPullRequest: null };
    }

    let provisionedWorkspace = mutationResult.workspace;
    try {
      const provisioned = await this.workspaceProvisioner.enqueueWorkspaceProvision({
        branch,
        contextEnabled: mutationResult.project.contextEnabled,
        kind: input.kind,
        localPath: requestedLocalPath,
        nodeId: input.nodeId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        repoKey: mutationResult.project.repoKey ?? mutationResult.project.id,
        setupHook: mutationResult.project.setupScript,
        sourceBranch,
        workspaceId: mutationResult.workspace.id,
        workspaceName: requestedWorkspaceName,
      });

      if (provisioned.localPath !== mutationResult.workspace.localPath) {
        const updatedRows = await this.db
          .update(workspaces)
          .set({ localPath: provisioned.localPath, updatedAt: new Date() })
          .where(eq(workspaces.id, mutationResult.workspace.id))
          .returning();

        provisionedWorkspace = updatedRows[0] ?? { ...mutationResult.workspace, localPath: provisioned.localPath };
      }
    } catch (error) {
      await this.rollbackFailedWorkspaceCreate(mutationResult);
      throw error;
    }

    return { ...provisionedWorkspace, latestPullRequest: null };
  }

  private async rollbackFailedWorkspaceCreate(result: WorkspaceCreateMutationResult): Promise<void> {
    if (result.change === "inserted") {
      await this.db.delete(workspaces).where(eq(workspaces.id, result.workspace.id));
      return;
    }

    if (!result.previousWorkspace) {
      return;
    }

    await this.db
      .update(workspaces)
      .set({
        status: result.previousWorkspace.status,
        sourceBranch: result.previousWorkspace.sourceBranch,
        localPath: result.previousWorkspace.localPath,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, result.previousWorkspace.id));
  }

  private async findExistingWorkspaceForCreate(
    db: Pick<AppDb, "select">,
    input: {
      actorUserId: string;
      branch: string | null;
      kind: WorkspaceKind;
      nodeId: string;
      organizationId: string;
      projectId: string;
      status: "active" | "closed";
    },
  ): Promise<Workspace | null> {
    const branchMatcher = input.branch ? eq(workspaces.branch, input.branch) : isNull(workspaces.branch);
    const workspaceRows = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, input.organizationId),
          eq(workspaces.projectId, input.projectId),
          eq(workspaces.userId, input.actorUserId),
          eq(workspaces.nodeId, input.nodeId),
          eq(workspaces.kind, input.kind),
          branchMatcher,
          eq(workspaces.status, input.status),
        ),
      )
      .limit(1);

    return workspaceRows[0] ?? null;
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

  async listWorkspaceFiles(input: {
    actorUserId: string;
    organizationId: string;
    path?: string;
    projectId: string;
    recursive?: boolean;
    workspaceId: string;
  }): Promise<WorkspaceFileView[]> {
    return listWorkspaceFilesViaRelay(this.getRelayDeps(), input);
  }

  async readWorkspaceFile(input: {
    actorUserId: string;
    maxChars?: number;
    organizationId: string;
    path: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceFileContentView> {
    return readWorkspaceFileViaRelay(this.getRelayDeps(), input);
  }

  async readWorkspaceDiff(input: {
    actorUserId: string;
    maxChars?: number;
    organizationId: string;
    path: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceFileDiffView> {
    return readWorkspaceDiffViaRelay(this.getRelayDeps(), input);
  }

  async listWorkspaceGitChanges(input: {
    actorUserId: string;
    organizationId: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceGitChangesView> {
    return listWorkspaceGitChangesViaRelay(this.getRelayDeps(), input);
  }

  async listWorkspaceGitBranches(input: {
    actorUserId: string;
    organizationId: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceGitBranchListView> {
    return listWorkspaceGitBranchesViaRelay(this.getRelayDeps(), input);
  }

  async refreshWorkspacePullRequest(input: {
    actorUserId: string;
    organizationId: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceCurrentPullRequestView> {
    return refreshWorkspacePullRequestViaRelay(this.getRelayDeps(), input);
  }

  async listWorkspaceTerminalSessions(input: {
    actorUserId: string;
    includeExited?: boolean;
    organizationId: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceTerminalSessionView[]> {
    return listWorkspaceTerminalSessionsViaRelay(this.getRelayDeps(), input);
  }

  async startWorkspaceTerminal(input: {
    actorUserId: string;
    args?: string[];
    cols?: number;
    command?: string;
    env?: Record<string, string> | string[];
    organizationId: string;
    paneId?: string;
    projectId: string;
    rows?: number;
    tabId?: string;
    workspaceId: string;
  }): Promise<WorkspaceTerminalStartView> {
    return startWorkspaceTerminalViaRelay(this.getRelayDeps(), input);
  }

  async stopWorkspaceTerminal(input: {
    actorUserId: string;
    organizationId: string;
    projectId: string;
    sessionId: string;
    workspaceId: string;
  }): Promise<void> {
    return stopWorkspaceTerminalViaRelay(this.getRelayDeps(), input);
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
          eq(workspaces.status, "active"),
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

  private getRelayDeps(): WorkspaceRelayDeps {
    if (!this.config) {
      throw new RelayUnavailableError();
    }

    return {
      config: this.config,
      db: this.db,
      organizationService: this.organizationService,
    };
  }
}
