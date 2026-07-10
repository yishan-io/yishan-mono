import type {
  WorkspaceCurrentPullRequest,
  WorkspaceCurrentPullRequestCheck,
  WorkspaceCurrentPullRequestDeployment,
} from "@yishan/core";

import { RelayRequestFailedError } from "@/errors";
import { type WorkspaceRelayContext, type WorkspaceRelayDeps, invokeWorkspaceRelay } from "@/services/workspace-relay";

export type WorkspaceCurrentPullRequestView = WorkspaceCurrentPullRequest | null;

function invalidRelayPayload(
  method: string,
  workspaceId: string,
  reason: string,
  details?: Record<string, unknown>,
): RelayRequestFailedError {
  return new RelayRequestFailedError(method, {
    reason,
    workspaceId,
    ...(details ?? {}),
  });
}

function readRecord(
  method: string,
  workspaceId: string,
  value: unknown,
  field?: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRelayPayload(method, workspaceId, "invalid_payload", field ? { field } : undefined);
  }

  return value as Record<string, unknown>;
}

function readWorkspaceCurrentPullRequestCheck(
  method: string,
  workspaceId: string,
  value: unknown,
): WorkspaceCurrentPullRequestCheck {
  const record = readRecord(method, workspaceId, value, "checks");
  const name = typeof record.name === "string" ? record.name : null;
  const state = typeof record.state === "string" ? record.state : null;
  if (!name || !state) {
    throw invalidRelayPayload(method, workspaceId, "invalid_payload", { field: "checks" });
  }

  return {
    description: typeof record.description === "string" ? record.description : undefined,
    name,
    state,
    url: typeof record.url === "string" ? record.url : undefined,
    workflow: typeof record.workflow === "string" ? record.workflow : undefined,
  };
}

function readWorkspaceCurrentPullRequestDeployment(
  method: string,
  workspaceId: string,
  value: unknown,
): WorkspaceCurrentPullRequestDeployment {
  const record = readRecord(method, workspaceId, value, "deployments");
  const id = typeof record.id === "number" && Number.isFinite(record.id) ? record.id : null;
  if (id === null) {
    throw invalidRelayPayload(method, workspaceId, "invalid_payload", { field: "deployments.id" });
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

function readWorkspaceCurrentPullRequest(
  method: string,
  workspaceId: string,
  value: unknown,
): WorkspaceCurrentPullRequest {
  const record = readRecord(method, workspaceId, value, "pullRequest");
  const number = typeof record.number === "number" && Number.isFinite(record.number) ? record.number : null;
  if (number === null) {
    throw invalidRelayPayload(method, workspaceId, "invalid_payload", { field: "pullRequest.number" });
  }

  return {
    baseBranch: typeof record.baseBranch === "string" ? record.baseBranch : undefined,
    branch: typeof record.branch === "string" ? record.branch : undefined,
    checks: Array.isArray(record.checks)
      ? record.checks.map((entry) => readWorkspaceCurrentPullRequestCheck(method, workspaceId, entry))
      : undefined,
    complete: typeof record.complete === "boolean" ? record.complete : undefined,
    deployments: Array.isArray(record.deployments)
      ? record.deployments.map((entry) => readWorkspaceCurrentPullRequestDeployment(method, workspaceId, entry))
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
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext,
): Promise<WorkspaceCurrentPullRequestView> {
  const method = "workspace.refreshPullRequest";
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method,
    params: {
      workspaceId: input.workspaceId,
    },
  });

  const record = readRecord(method, input.workspaceId, result);
  return record.pullRequest === null ? null : readWorkspaceCurrentPullRequest(method, input.workspaceId, record.pullRequest);
}
