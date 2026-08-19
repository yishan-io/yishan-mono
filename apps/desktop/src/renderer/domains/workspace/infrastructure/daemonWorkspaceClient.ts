import { request, subscribeConnectionStatus as subscribeDaemonConnectionStatusFromTransport } from "@renderer/rpc";
import {
  asRecord,
  readOptionalBoolean,
  readOptionalString,
  readOptionalStringArray,
} from "@shared/validation/primitiveReaders";
import type { DaemonLocalFolder } from "../model/snapshotTypes";

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

export function subscribeDaemonConnectionStatus(
  listener: (status: "connected" | "connecting" | "disconnected") => void,
): () => void {
  return subscribeDaemonConnectionStatusFromTransport(listener);
}

/**
 * Workspace wire DTOs (desktop7 Phase 24). Owned by the Workspace Domain
 * Infrastructure; the daemon payload shapes are the transport contract and
 * are mapped to Domain-owned types where the Domain owns semantics.
 */

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
function readDaemonLocalFolder(value: unknown): DaemonLocalFolder | undefined {
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
export class DaemonWorkspaceClient {
  private readonly invoke: InvokeFn;
  readonly workspaceIdByWorktreePath: Map<string, string>;

  constructor(invoke: InvokeFn, workspaceIdByWorktreePath: Map<string, string>) {
    this.invoke = invoke;
    this.workspaceIdByWorktreePath = workspaceIdByWorktreePath;
  }

  async list(): Promise<DaemonWorkspace[]> {
    const result = await this.invoke("list");
    if (!Array.isArray(result)) {
      return [];
    }

    const workspaces: DaemonWorkspace[] = [];
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
        state: readOptionalString(record.state),
        health: readOptionalString(record.health),
        orgId: readOptionalString(record.orgId),
        projectId: readOptionalString(record.projectId),
        pullRequest: readDaemonWorkspacePullRequest(record.pullRequest),
      });
    }

    return workspaces;
  }

  async refreshPullRequest(input: WorkspaceRefreshPullRequestInput): Promise<DaemonWorkspace> {
    const workspaceId = input.workspaceId.trim();
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }

    const record = asRecord(
      await this.invoke("workspace.refreshPullRequest", {
        workspaceId,
      }),
    );
    if (!record) {
      throw new Error("daemon workspace refreshPullRequest returned invalid response");
    }

    const id = readOptionalString(record.id) || workspaceId;
    const path = normalizeWorktreePath(readOptionalString(record.path) || "");
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

      throw new Error(`daemon workspace not found for id: ${normalizedPreferredWorkspaceId}`);
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

    throw new Error(`daemon workspace is not open for path: ${normalizedWorktreePath}`);
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

  async createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceCreateResponse> {
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

    const createdWorkspace = (await this.invoke(
      "workspace.create",
      {
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
      },
      WORKSPACE_CREATE_TIMEOUT_MS,
    )) as DaemonWorkspace & { lifecycleScriptWarnings?: unknown[] };

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
    };
  }

  async syncContextLink(input: WorkspaceSyncContextLinkInput): Promise<WorkspaceSyncContextLinkResponse> {
    const record = asRecord(input);
    const repoKey = readOptionalString(record?.repoKey);
    const nonGit = readOptionalBoolean(record?.nonGit) ?? false;
    if (!repoKey && !nonGit) {
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
      repoKey: repoKey ?? "",
      nonGit,
      enabled,
      worktreePaths: normalizedPaths,
    })) as Partial<WorkspaceSyncContextLinkResponse> | null | undefined;

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

  async close(input: WorkspaceCloseExecutionInput): Promise<WorkspaceCloseExecutionResponse> {
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
    })) as WorkspaceCloseExecutionResponse;
  }

  async health(input: WorkspaceHealthInput): Promise<WorkspaceHealthOutput> {
    return (await this.invoke("workspace.health", input)) as WorkspaceHealthOutput;
  }

  async openProject(input: WorkspaceOpenProjectInput): Promise<WorkspaceOpenProjectOutput> {
    return (await this.invoke("workspace.openProject", input)) as WorkspaceOpenProjectOutput;
  }

  async closeProject(input: WorkspaceCloseProjectInput): Promise<WorkspaceCloseProjectOutput> {
    return (await this.invoke("workspace.closeProject", input)) as WorkspaceCloseProjectOutput;
  }

  async createLocalFolder(input: { path: string; name?: string }): Promise<DaemonLocalFolder> {
    const record = asRecord(input);
    const rawPath = readOptionalString(record?.path);
    if (!rawPath) {
      throw new Error("path is required");
    }

    const created = readDaemonLocalFolder(
      await this.invoke("workspace.createLocalFolder", {
        path: rawPath,
        name: readOptionalString(record?.name),
      }),
    );
    if (!created || !created.id) {
      throw new Error("daemon workspace createLocalFolder returned invalid response");
    }

    return created;
  }

  async listLocalFolders(): Promise<DaemonLocalFolder[]> {
    const result = await this.invoke("workspace.listLocalFolders");
    if (!Array.isArray(result)) {
      return [];
    }

    const folders: DaemonLocalFolder[] = [];
    for (const candidate of result) {
      const parsed = readDaemonLocalFolder(candidate);
      if (parsed) {
        folders.push(parsed);
      }
    }
    return folders;
  }

  async deleteLocalFolder(input: { id: string }): Promise<void> {
    const folderId = (input.id || "").trim();
    if (!folderId) {
      throw new Error("id is required");
    }

    await this.invoke("workspace.deleteLocalFolder", { id: folderId });
  }
}

let cachedWorkspaceRpc: DaemonWorkspaceClient | null = null;

/**
 * Lazily resolves the workspace Domain RPC adapter over the root transport
 * (dependency direction: Domain RPC adapter → root RPC transport).
 */
export async function getWorkspaceRpc(): Promise<DaemonWorkspaceClient> {
  if (!cachedWorkspaceRpc) {
    const workspaceIdByWorktreePath = new Map<string, string>();
    // The worktree-path cache is workspace Domain state (desktop8 Phase 31):
    // the workspace adapter owns it and clears it when the daemon reconnects
    // (matching the transport's previous reconnect behavior).
    subscribeDaemonConnectionStatusFromTransport((status) => {
      if (status === "connected") {
        workspaceIdByWorktreePath.clear();
      }
    });
    cachedWorkspaceRpc = new DaemonWorkspaceClient(request, workspaceIdByWorktreePath);
  }
  return cachedWorkspaceRpc;
}
