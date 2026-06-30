import { and, eq, inArray, isNull } from "drizzle-orm";
import type {
  WorkspaceFileContent,
  WorkspaceFileDiff,
  WorkspaceFileEntry,
  WorkspaceGitBranchList,
  WorkspaceGitChanges,
} from "@yishan/core";

import type { AppDb } from "@/db/client";
import { organizationMembers, projects, workspaces } from "@/db/schema";
import type { Workspace, WorkspaceKind, WorkspacePullRequestState } from "@/db/schema";
import type { WorkspaceStatus } from "@/db/schema";
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
import {
  type RelayWorkspaceConnectionAccess,
  type WorkspaceRelayDeps,
  resolveWorkspaceRelayAccess,
} from "@/services/workspace-relay";
import {
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
  status: WorkspaceStatus;
  branch: string | null;
  sourceBranch: string | null;
  localPath: string;
  latestPullRequest: WorkspacePullRequestSummary | null;
  createdAt: Date;
  updatedAt: Date;
};

export type {
  WorkspaceFileContent as WorkspaceFileContentView,
  WorkspaceFileDiff as WorkspaceFileDiffView,
  WorkspaceFileEntry as WorkspaceFileView,
  WorkspaceGitBranchList as WorkspaceGitBranchListView,
  WorkspaceGitChange as WorkspaceGitChangeView,
  WorkspaceGitChangeKind,
  WorkspaceGitChanges as WorkspaceGitChangesView,
} from "@yishan/core";
export type { RelayWorkspaceConnectionAccess as WorkspaceRelayConnectionView } from "@/services/workspace-relay";
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

type UpdateWorkspaceInput = {
  workspaceId: string;
  organizationId: string;
  actorUserId: string;
  projectId: string;
  localPath: string;
};

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
  }): Promise<RelayWorkspaceConnectionAccess> {
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
    const requestedLocalPath = input.localPath?.trim() ?? "";
    const requestedWorkspaceName = input.name?.trim() || branch || null;
    const requestedStatus: WorkspaceStatus = requestedLocalPath ? "active" : "provisioning";

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
          statuses: ["active", "provisioning"],
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
          statuses: ["closed"],
        });
        if (closedWorkspace) {
          const reactivatedRows = await tx
            .update(workspaces)
            .set({
              status: requestedStatus,
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
            status: requestedStatus,
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
        statuses: ["active", "provisioning"],
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
      statuses: WorkspaceStatus[];
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
          input.statuses.length === 1
            ? eq(workspaces.status, input.statuses[0]!)
            : inArray(workspaces.status, input.statuses),
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

  async listWorkspaceFiles(input: {
    actorUserId: string;
    organizationId: string;
    path?: string;
    projectId: string;
    recursive?: boolean;
    workspaceId: string;
  }): Promise<WorkspaceFileEntry[]> {
    return listWorkspaceFilesViaRelay(this.getRelayDeps(), input);
  }

  async readWorkspaceFile(input: {
    actorUserId: string;
    maxChars?: number;
    organizationId: string;
    path: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceFileContent> {
    return readWorkspaceFileViaRelay(this.getRelayDeps(), input);
  }

  async readWorkspaceDiff(input: {
    actorUserId: string;
    maxChars?: number;
    organizationId: string;
    path: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceFileDiff> {
    return readWorkspaceDiffViaRelay(this.getRelayDeps(), input);
  }

  async listWorkspaceGitChanges(input: {
    actorUserId: string;
    organizationId: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceGitChanges> {
    return listWorkspaceGitChangesViaRelay(this.getRelayDeps(), input);
  }

  async listWorkspaceGitBranches(input: {
    actorUserId: string;
    organizationId: string;
    projectId: string;
    workspaceId: string;
  }): Promise<WorkspaceGitBranchList> {
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
