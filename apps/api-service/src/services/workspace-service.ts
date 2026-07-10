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
import type { WorkspaceKind, WorkspacePullRequestState } from "@/db/schema";
import type { WorkspaceStatus } from "@/db/schema";
import {
  PrimaryWorkspaceProvisionNotSupportedError,
  PrimaryWorkspaceCloseNotAllowedError,
  ProjectNotFoundError,
  RelayUnavailableError,
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
import {
  invokeWorkspaceRelay,
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
  source?: "daemon";
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
    if (input.kind === "primary" && !requestedLocalPath) {
      throw new PrimaryWorkspaceProvisionNotSupportedError();
    }

    const createResult = await this.db.transaction(async (tx) => {
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

      try {
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
            sourceBranch,
            localPath: requestedLocalPath,
            status: requestedStatus,
          })
          .returning();

        const workspace = insertedRows[0];
        if (!workspace) {
          throw new WorkspaceCreateFailedError();
        }

        return { project, workspace };
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

    const provisioned = await this.workspaceProvisioner.enqueueWorkspaceProvision({
      branch,
      contextEnabled: createResult.project.contextEnabled,
      kind: input.kind,
      localPath: requestedLocalPath,
      nodeId: input.nodeId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      repoKey: createResult.project.repoKey ?? createResult.project.id,
      setupHook: createResult.project.setupScript,
      sourceBranch,
      workspaceId: createResult.workspace.id,
      workspaceName: requestedWorkspaceName,
    });

    if (provisioned.localPath === createResult.workspace.localPath) {
      return { ...createResult.workspace, latestPullRequest: null };
    }

    const updatedRows = await this.db
      .update(workspaces)
      .set({ localPath: provisioned.localPath, updatedAt: new Date() })
      .where(eq(workspaces.id, createResult.workspace.id))
      .returning();

    const workspace = updatedRows[0] ?? { ...createResult.workspace, localPath: provisioned.localPath };
    return { ...workspace, latestPullRequest: null };
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

    if (input.source !== "daemon" && existing.status === "active" && existing.localPath.trim() && this.config) {
      await invokeWorkspaceRelay({
        ...this.getRelayDeps(),
        actorUserId: input.actorUserId,
        method: "workspace.close",
        organizationId: input.organizationId,
        params: {
          workspaceId: existing.id,
          organizationId: input.organizationId,
          projectId: input.projectId,
          branch: existing.branch ?? undefined,
        },
        projectId: input.projectId,
        workspaceId: input.workspaceId,
      });

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
        changed: current.status === "closed",
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
