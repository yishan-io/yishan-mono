import type {
  WorkspaceCurrentPullRequest,
  WorkspaceCurrentPullRequestCheck,
  WorkspaceCurrentPullRequestDeployment,
} from "@yishan/core";

import type { AppDb } from "@/db/client";
import type { OrganizationService } from "@/services/organization-service";
import { invokeWorkspaceRelay } from "@/services/workspace-relay";
import type { ServiceConfig } from "@/types";

export type WorkspaceCurrentPullRequestView = WorkspaceCurrentPullRequest | null;

type WorkspaceRelayPullRequestDeps = {
  config: ServiceConfig;
  db: AppDb;
  organizationService: OrganizationService;
};

function readWorkspaceCurrentPullRequestCheck(value: unknown): WorkspaceCurrentPullRequestCheck | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : null;
  const state = typeof record.state === "string" ? record.state : null;
  if (!name || !state) {
    return undefined;
  }

  return {
    description: typeof record.description === "string" ? record.description : undefined,
    name,
    state,
    url: typeof record.url === "string" ? record.url : undefined,
    workflow: typeof record.workflow === "string" ? record.workflow : undefined,
  };
}

function readWorkspaceCurrentPullRequestDeployment(value: unknown): WorkspaceCurrentPullRequestDeployment | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "number" && Number.isFinite(record.id) ? record.id : null;
  if (id === null) {
    return undefined;
  }

  return {
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    description: typeof record.description === "string" ? record.description : undefined,
    environment: typeof record.environment === "string" ? record.environment : undefined,
    environmentUrl: typeof record.environmentUrl === "string" ? record.environmentUrl : undefined,
    id,
    originalPayload: typeof record.originalPayload === "string" ? record.originalPayload : undefined,
    state: typeof record.state === "string" ? record.state : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

function readWorkspaceCurrentPullRequest(value: unknown): WorkspaceCurrentPullRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const number = typeof record.number === "number" && Number.isFinite(record.number) ? record.number : null;
  if (number === null) {
    return null;
  }

  return {
    baseBranch: typeof record.baseBranch === "string" ? record.baseBranch : undefined,
    branch: typeof record.branch === "string" ? record.branch : undefined,
    checks: Array.isArray(record.checks)
      ? record.checks
          .map((entry) => readWorkspaceCurrentPullRequestCheck(entry))
          .filter((entry): entry is WorkspaceCurrentPullRequestCheck => entry !== undefined)
      : undefined,
    complete: typeof record.complete === "boolean" ? record.complete : undefined,
    deployments: Array.isArray(record.deployments)
      ? record.deployments
          .map((entry) => readWorkspaceCurrentPullRequestDeployment(entry))
          .filter((entry): entry is WorkspaceCurrentPullRequestDeployment => entry !== undefined)
      : undefined,
    githubState: typeof record.githubState === "string" ? record.githubState : undefined,
    isDraft: typeof record.isDraft === "boolean" ? record.isDraft : undefined,
    number,
    reviewDecision: typeof record.reviewDecision === "string" ? record.reviewDecision : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    title: typeof record.title === "string" ? record.title : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    url: typeof record.url === "string" ? record.url : undefined,
  };
}

export async function refreshWorkspacePullRequestViaRelay(
  deps: WorkspaceRelayPullRequestDeps,
  input: {
    actorUserId: string;
    organizationId: string;
    projectId: string;
    workspaceId: string;
  },
): Promise<WorkspaceCurrentPullRequestView> {
  const { result } = await invokeWorkspaceRelay<unknown>({
    actorUserId: input.actorUserId,
    config: deps.config,
    db: deps.db,
    method: "workspace.refreshPullRequest",
    organizationId: input.organizationId,
    organizationService: deps.organizationService,
    params: {
      workspaceId: input.workspaceId,
    },
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });

  if (!result || typeof result !== "object") {
    return null;
  }

  const record = result as Record<string, unknown>;
  return readWorkspaceCurrentPullRequest(record.pullRequest);
}
