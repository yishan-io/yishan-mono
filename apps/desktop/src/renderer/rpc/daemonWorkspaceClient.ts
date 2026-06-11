import { generateId } from "../helpers/generateId";
import type * as Rpc from "./daemonTypes";
import {
  asRecord,
  normalizeWorktreePath,
  readOptionalBoolean,
  readOptionalString,
  readOptionalStringArray,
} from "./helpers";

type InvokeFn = (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>;

// workspace.create can take a very long time for large repos (shallow fetch +
// worktree checkout + setup script). Use a dedicated long timeout.
const WORKSPACE_CREATE_TIMEOUT_MS = 40 * 60 * 1_000;

/** Parses a pull-request check entry from a raw daemon payload. */
function readDaemonWorkspacePullRequestCheck(value: unknown): Rpc.DaemonWorkspacePullRequestCheck | undefined {
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
function readDaemonWorkspacePullRequestDeployment(
  value: unknown,
): Rpc.DaemonWorkspacePullRequestDeployment | undefined {
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
export function readDaemonWorkspacePullRequest(value: unknown): Rpc.DaemonWorkspacePullRequest | undefined {
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
          .filter((item): item is Rpc.DaemonWorkspacePullRequestCheck => item !== undefined)
      : undefined,
    deployments: Array.isArray(record.deployments)
      ? record.deployments
          .map((item) => readDaemonWorkspacePullRequestDeployment(item))
          .filter((item): item is Rpc.DaemonWorkspacePullRequestDeployment => item !== undefined)
      : undefined,
  };
}

/** Workspace namespace methods for the daemon RPC client. */
export class DaemonWorkspaceClient {
  private readonly invoke: InvokeFn;
  readonly workspaceIdByWorktreePath: Map<string, string>;

  constructor(invoke: InvokeFn, workspaceIdByWorktreePath: Map<string, string>) {
    this.invoke = invoke;
    this.workspaceIdByWorktreePath = workspaceIdByWorktreePath;
  }

  async list(): Promise<Rpc.DaemonWorkspace[]> {
    const result = await this.invoke("list");
    if (!Array.isArray(result)) {
      return [];
    }

    const workspaces: Rpc.DaemonWorkspace[] = [];
    for (const candidate of result) {
      const record = asRecord(candidate);
      if (!record) {
        continue;
      }

      const id = readOptionalString(record.id);
      const path = readOptionalString(record.path);
      if (!id || !path) {
        continue;
      }

      workspaces.push({
        id,
        path: normalizeWorktreePath(path),
        orgId: readOptionalString(record.orgId),
        projectId: readOptionalString(record.projectId),
        pullRequest: readDaemonWorkspacePullRequest(record.pullRequest),
      });
    }

    return workspaces;
  }

  async open(input: Rpc.WorkspaceOpenInput): Promise<Rpc.DaemonWorkspace> {
    const workspaceId = input.workspaceId.trim();
    const workspaceWorktreePath = normalizeWorktreePath(input.workspaceWorktreePath);
    if (!workspaceId || !workspaceWorktreePath) {
      throw new Error("workspaceId and workspaceWorktreePath are required");
    }

    const record = asRecord(
      await this.invoke("open", {
        id: workspaceId,
        path: workspaceWorktreePath,
        ...(input.orgId ? { orgId: input.orgId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.pullRequestAlreadyMerged ? { pullRequestAlreadyMerged: true } : {}),
      }),
    );
    if (!record) {
      throw new Error("daemon workspace open returned invalid response");
    }

    const id = readOptionalString(record.id) || workspaceId;
    const path = normalizeWorktreePath(readOptionalString(record.path) || workspaceWorktreePath);
    this.workspaceIdByWorktreePath.set(path, id);
    return {
      id,
      path,
      pullRequest: readDaemonWorkspacePullRequest(record.pullRequest),
    };
  }

  async refreshPullRequest(input: Rpc.WorkspaceRefreshPullRequestInput): Promise<Rpc.DaemonWorkspace> {
    const workspaceId = input.workspaceId?.trim();
    const workspaceWorktreePath = input.workspaceWorktreePath
      ? normalizeWorktreePath(input.workspaceWorktreePath)
      : undefined;
    if (!workspaceId && !workspaceWorktreePath) {
      throw new Error("workspaceId or workspaceWorktreePath is required");
    }

    const record = asRecord(
      await this.invoke("workspace.refreshPullRequest", {
        ...(workspaceId ? { workspaceId } : {}),
        ...(workspaceWorktreePath ? { path: workspaceWorktreePath } : {}),
      }),
    );
    if (!record) {
      throw new Error("daemon workspace refreshPullRequest returned invalid response");
    }

    const id = readOptionalString(record.id) || workspaceId || "";
    const path = normalizeWorktreePath(readOptionalString(record.path) || workspaceWorktreePath || "");
    if (id && path) {
      this.workspaceIdByWorktreePath.set(path, id);
    }
    return {
      id,
      path,
      orgId: readOptionalString(record.orgId),
      projectId: readOptionalString(record.projectId),
      pullRequest: readDaemonWorkspacePullRequest(record.pullRequest),
    };
  }

  async ensureIdByWorktreePath(worktreePath: string, preferredWorkspaceId?: string): Promise<string> {
    const normalizedWorktreePath = normalizeWorktreePath(worktreePath);
    const normalizedPreferredWorkspaceId = preferredWorkspaceId?.trim();
    if (normalizedPreferredWorkspaceId) {
      const workspaces = await this.list();
      for (const workspace of workspaces) {
        this.workspaceIdByWorktreePath.set(workspace.path, workspace.id);
      }

      const existingPreferredWorkspace = workspaces.find(
        (workspace) => workspace.id === normalizedPreferredWorkspaceId,
      );
      if (existingPreferredWorkspace) {
        return existingPreferredWorkspace.id;
      }

      await this.invoke("open", {
        id: normalizedPreferredWorkspaceId,
        path: normalizedWorktreePath,
      });
      this.workspaceIdByWorktreePath.set(normalizedWorktreePath, normalizedPreferredWorkspaceId);
      return normalizedPreferredWorkspaceId;
    }

    const cachedWorkspaceId = this.workspaceIdByWorktreePath.get(normalizedWorktreePath);
    if (cachedWorkspaceId) {
      return cachedWorkspaceId;
    }

    const workspaces = await this.list();
    for (const workspace of workspaces) {
      this.workspaceIdByWorktreePath.set(workspace.path, workspace.id);
    }

    const existingWorkspace = workspaces.find((workspace) => workspace.path === normalizedWorktreePath);
    if (existingWorkspace) {
      return existingWorkspace.id;
    }

    const workspaceId = generateId();
    await this.invoke("open", {
      id: workspaceId,
      path: normalizedWorktreePath,
    });
    this.workspaceIdByWorktreePath.set(normalizedWorktreePath, workspaceId);
    return workspaceId;
  }

  async resolveId(input: unknown): Promise<string> {
    const record = asRecord(input);
    if (!record) {
      throw new Error("workspace input is required");
    }

    const workspaceId = readOptionalString(record.workspaceId);
    const workspaceWorktreePath = readOptionalString(record.workspaceWorktreePath);
    if (workspaceWorktreePath) {
      return await this.ensureIdByWorktreePath(workspaceWorktreePath, workspaceId);
    }

    const cwd = readOptionalString(record.cwd);
    if (cwd) {
      return await this.ensureIdByWorktreePath(cwd, workspaceId);
    }

    if (workspaceId) {
      return workspaceId;
    }

    throw new Error("workspaceId or workspaceWorktreePath is required");
  }

  async createWorkspace(input: Rpc.WorkspaceCreateInput): Promise<Rpc.WorkspaceCreateResponse> {
    const record = asRecord(input);
    const organizationId = readOptionalString(record?.organizationId);
    if (!organizationId) {
      throw new Error("organizationId is required");
    }
    const sourcePath = readOptionalString(record?.sourcePath);
    if (!sourcePath) {
      throw new Error("sourcePath is required");
    }
    const repoKey = readOptionalString(record?.repoKey);
    if (!repoKey) {
      throw new Error("repoKey is required");
    }
    const sourceBranch = readOptionalString(record?.sourceBranch) || "";
    if (!sourceBranch) {
      throw new Error("sourceBranch is required");
    }
    const targetBranch = readOptionalString(record?.targetBranch) || sourceBranch;
    const workspaceName = readOptionalString(record?.workspaceName) || targetBranch;
    const contextEnabled = readOptionalBoolean(record?.contextEnabled) ?? false;
    const setupHook = readOptionalString(record?.setupHook) || "";

    const createdWorkspace = (await this.invoke("workspace.create", {
      organizationId,
      nodeId: readOptionalString(record?.nodeId) || undefined,
      projectId: readOptionalString(record?.projectId) || "",
      repoKey,
      workspaceName,
      sourcePath,
      targetBranch,
      sourceBranch,
      contextEnabled,
      setupHook,
      taskRun: record?.taskRun,
    }, WORKSPACE_CREATE_TIMEOUT_MS)) as Rpc.DaemonWorkspace & { lifecycleScriptWarnings?: unknown[]; remoteSyncWarning?: unknown };

    const createdWorktreePath = createdWorkspace.path || "";
    const resolvedId = createdWorkspace.id || "";
    if (createdWorktreePath && resolvedId) {
      this.workspaceIdByWorktreePath.set(createdWorktreePath, resolvedId);
    }

    return {
      workspaceId: resolvedId,
      projectId: readOptionalString(record?.projectId) || resolvedId,
      name: workspaceName,
      sourceBranch,
      branch: targetBranch,
      worktreePath: createdWorktreePath,
      status: "active",
      lifecycleScriptWarnings: Array.isArray(createdWorkspace.lifecycleScriptWarnings)
        ? createdWorkspace.lifecycleScriptWarnings
        : [],
      remoteSyncWarning: readOptionalString(createdWorkspace.remoteSyncWarning),
    };
  }

  async syncContextLink(input: Rpc.WorkspaceSyncContextLinkInput): Promise<Rpc.WorkspaceSyncContextLinkResponse> {
    const record = asRecord(input);
    const repoKey = readOptionalString(record?.repoKey);
    if (!repoKey) {
      throw new Error("repoKey is required");
    }
    const enabled = readOptionalBoolean(record?.enabled) ?? false;
    const rawPaths = readOptionalStringArray(record?.worktreePaths) ?? [];
    const normalizedPaths = Array.from(
      new Set(
        rawPaths
          .map((path) => normalizeWorktreePath(path))
          .filter((path): path is string => typeof path === "string" && path.length > 0),
      ),
    );

    const result = (await this.invoke("workspace.syncContextLink", {
      repoKey,
      enabled,
      worktreePaths: normalizedPaths,
    })) as Partial<Rpc.WorkspaceSyncContextLinkResponse> | null | undefined;

    return {
      updated: Array.isArray(result?.updated)
        ? result.updated.filter((item): item is string => typeof item === "string")
        : [],
      skipped: Array.isArray(result?.skipped)
        ? result.skipped.filter((item): item is string => typeof item === "string")
        : [],
      errors:
        result?.errors && typeof result.errors === "object"
          ? Object.fromEntries(Object.entries(result.errors).filter(([, value]) => typeof value === "string"))
          : {},
    };
  }

  async close(input: Rpc.WorkspaceCloseExecutionInput): Promise<Rpc.WorkspaceCloseExecutionResponse> {
    const record = asRecord(input);
    const workspaceId = await this.resolveId(input);
    const organizationId = readOptionalString(record?.organizationId);
    const projectId = readOptionalString(record?.projectId);
    const branch = readOptionalString(record?.branch);
    const removeBranch = readOptionalBoolean(record?.removeBranch) ?? false;
    const postHook = readOptionalString(record?.postHook) || "";
    return (await this.invoke("workspace.close", {
      workspaceId,
      organizationId,
      projectId,
      branch,
      removeBranch,
      forceWorktree: true,
      forceBranch: true,
      postHook,
    })) as Rpc.WorkspaceCloseExecutionResponse;
  }
}
