import {
  asRecord,
  readOptionalBoolean,
  readOptionalString,
  readOptionalStringArray,
} from "@shared/validation/primitiveReaders";
import type { DaemonLocalFolder } from "../model/snapshotTypes";

/**
 * Workspace daemon wire DTOs + payload readers (desktop8 Phase 33: split
 * from daemonWorkspaceClient.ts).
 */

/** Normalizes one worktree path for cache keys and comparisons. */
export function normalizeWorktreePath(worktreePath: string): string {
  const trimmedPath = worktreePath.trim();
  if (!trimmedPath) {
    return "";
  }

  const slashNormalizedPath = trimmedPath.replace(/\\/g, "/");
  if (slashNormalizedPath === "/") {
    return "/";
  }

  return slashNormalizedPath.replace(/\/+$/, "");
}

export type DaemonWorkspace = {
  id: string;
  path: string;
  state?: string;
  health?: string;
  orgId?: string;
  projectId?: string;
  pullRequest?: DaemonWorkspacePullRequest;
};

export type DaemonWorkspacePullRequest = {
  number: number;
  title?: string;
  url?: string;
  branch?: string;
  baseBranch?: string;
  githubState?: string;
  status?: string;
  reviewDecision?: string;
  isDraft?: boolean;
  complete?: boolean;
  updatedAt?: string;
  checks?: DaemonWorkspacePullRequestCheck[];
  deployments?: DaemonWorkspacePullRequestDeployment[];
};

export type DaemonWorkspacePullRequestCheck = {
  name: string;
  workflow?: string;
  state: string;
  description?: string;
  url?: string;
};

export type DaemonWorkspacePullRequestDeployment = {
  id: number;
  environment?: string;
  state?: string;
  description?: string;
  environmentUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  originalPayload?: string;
};

export type WorkspaceCreateInput = {
  workspaceId?: string;
  organizationId?: string;
  nodeId?: string;
  repoKey?: string;
  sourcePath?: string;
  workspaceName?: string;
  projectId?: string;
  sourceBranch?: string;
  targetBranch?: string;
  contextEnabled?: boolean;
  setupHook?: string;
  taskRun?: {
    agentKind?: string;
    prompt?: string;
    model?: string;
  };
};

export type WorkspaceRefreshPullRequestInput = {
  workspaceId: string;
};

export type WorkspaceSyncContextLinkInput = {
  repoKey: string;
  nonGit?: boolean;
  enabled: boolean;
  worktreePaths: string[];
};

export type WorkspaceSyncContextLinkResponse = {
  updated: string[];
  skipped: string[];
  errors: Record<string, string>;
};

export type WorkspaceCloseExecutionInput = {
  workspaceId: string;
  organizationId?: string;
  projectId?: string;
  branch?: string;
  removeBranch?: boolean;
  postHook?: string;
};

export type WorkspaceHealthInput = {
  workspaceId: string;
};

export type WorkspaceHealthOutput = {
  workspaceId: string;
  state: string;
  health?: string;
  path: string;
  error?: string;
};

export type WorkspaceOpenProjectInput = {
  workspaces: Array<{
    workspaceId: string;
    worktreePath: string;
    projectId?: string;
    orgId?: string;
  }>;
};

export type WorkspaceOpenProjectOutput = {
  opened: string[];
  skipped: string[];
  errors: string[];
};

export type WorkspaceCloseProjectInput = {
  workspaceIds: string[];
};

export type WorkspaceCloseProjectOutput = {
  stopped: string[];
};

export type WorkspaceStateChangedEvent = {
  workspaceId: string;
  state: string;
  health?: string;
  removed: boolean;
};

export type WorkspaceListResponse = DaemonWorkspace[];

export type WorkspaceCreateResponse = {
  workspaceId: string;
  projectId: string;
  name: string;
  sourceBranch: string;
  branch: string;
  worktreePath: string;
  status: string;
  lifecycleScriptWarnings: unknown[];
};

export type WorkspaceCloseExecutionResponse = {
  workspace: { id: string; status: string };
  workspaceId: string;
  lifecycleScriptWarnings: unknown[];
};

type InvokeFn = (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>;

// workspace.create can take a very long time for large repos (shallow fetch +
// worktree checkout + setup script). Use a dedicated long timeout.
const WORKSPACE_CREATE_TIMEOUT_MS = 40 * 60 * 1_000;

/** Parses a pull-request check entry from a raw daemon payload. */
function readDaemonWorkspacePullRequestCheck(value: unknown): DaemonWorkspacePullRequestCheck | undefined {
  const record = asRecord(value);
  const name = readOptionalString(record?.name);
  const state = readOptionalString(record?.state);
  if (!record || !name || !state) {
    return undefined;
  }

  return {
    name,
    workflow: readOptionalString(record.workflow),
    state,
    description: readOptionalString(record.description),
    url: readOptionalString(record.url),
  };
}

/** Parses a pull-request deployment entry from a raw daemon payload. */
function readDaemonWorkspacePullRequestDeployment(value: unknown): DaemonWorkspacePullRequestDeployment | undefined {
  const record = asRecord(value);
  const id = typeof record?.id === "number" ? record.id : null;
  if (!record || !id || !Number.isFinite(id)) {
    return undefined;
  }

  return {
    id,
    environment: readOptionalString(record.environment),
    state: readOptionalString(record.state),
    description: readOptionalString(record.description),
    environmentUrl: readOptionalString(record.environmentUrl),
    createdAt: readOptionalString(record.createdAt),
    updatedAt: readOptionalString(record.updatedAt),
    originalPayload: readOptionalString(record.originalPayload),
  };
}

/** Parses a pull-request from a raw daemon workspace payload. */
export function readDaemonWorkspacePullRequest(value: unknown): DaemonWorkspacePullRequest | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const numberValue = typeof record.number === "number" ? record.number : null;
  if (!numberValue || !Number.isFinite(numberValue)) {
    return undefined;
  }

  return {
    number: numberValue,
    title: readOptionalString(record.title),
    url: readOptionalString(record.url),
    branch: readOptionalString(record.branch),
    baseBranch: readOptionalString(record.baseBranch),
    githubState: readOptionalString(record.githubState),
    status: readOptionalString(record.status),
    reviewDecision: readOptionalString(record.reviewDecision),
    isDraft: readOptionalBoolean(record.isDraft) ?? undefined,
    complete: readOptionalBoolean(record.complete) ?? undefined,
    updatedAt: readOptionalString(record.updatedAt),
    checks: Array.isArray(record.checks)
      ? record.checks
          .map((item) => readDaemonWorkspacePullRequestCheck(item))
          .filter((item): item is DaemonWorkspacePullRequestCheck => item !== undefined)
      : undefined,
    deployments: Array.isArray(record.deployments)
      ? record.deployments
          .map((item) => readDaemonWorkspacePullRequestDeployment(item))
          .filter((item): item is DaemonWorkspacePullRequestDeployment => item !== undefined)
      : undefined,
  };
}

/** Parses a local folder workspace from a raw daemon payload. */
export function readDaemonLocalFolder(value: unknown): DaemonLocalFolder | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const id = readOptionalString(record.id);
  const rawPath = readOptionalString(record.localPath) || readOptionalString(record.path) || "";
  const path = normalizeWorktreePath(rawPath);
  if (!id || !path) {
    return undefined;
  }

  return {
    id,
    path,
    name: readOptionalString(record.name),
    state: readOptionalString(record.state),
    health: readOptionalString(record.health),
  };
}

/** Workspace namespace methods for the daemon RPC client. */
