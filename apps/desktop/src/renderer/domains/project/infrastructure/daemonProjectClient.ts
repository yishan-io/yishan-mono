import type { ProjectCommandRecord, ProjectRecord, ProjectWithWorkspacesRecord, WorkspaceRecord } from "../../../api/types";
import { asRecord, readOptionalBoolean, readOptionalString } from "../../../rpc/helpers";
import { getDaemonTransport } from "../../../rpc/rpcTransport";

/** One hierarchy mode's left-pane order/fold state (order hints; missing ids are last). */
export type ProjectListModePreference = {
  projectOrderIds: string[];
  nodeOrderByParentId: Record<string, string[]>;
  foldedProjectIds: string[];
  foldedNodeKeys: string[];
};

/** One org's persisted left-pane list state, versioned for forward compatibility. */
export type ProjectListPreference = {
  version: number;
  by_project: ProjectListModePreference;
  by_node: ProjectListModePreference;
  /** Workspace order shared across modes, keyed by `${projectId}:${nodeId}`. */
  workspaceOrderByParentId: Record<string, string[]>;
};

type InvokeFn = (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>;

type DaemonWorkspacePayload = Record<string, unknown>;

function toSourceType(value: string | undefined): "git" | "git-local" | "unknown" {
  if (value === "git" || value === "git-local") return value;
  return "unknown";
}

function toWorkspaceKind(value: string | undefined): "primary" | "worktree" {
  return value === "primary" ? "primary" : "worktree";
}

function toWorkspaceStatus(value: string | undefined): "active" | "closed" | "provisioning" {
  if (value === "closed" || value === "provisioning") return value;
  return "active";
}

function toWorkspaceLifecycleState(value: string | undefined): WorkspaceRecord["state"] {
  if (value === "active" || value === "error" || value === "closing") return value;
  return undefined;
}

function toWorkspaceHealth(value: string | undefined): WorkspaceRecord["health"] {
  if (value === "path-missing" || value === "not-worktree") return value;
  return undefined;
}

function toProjectCommands(value: unknown): ProjectCommandRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item: unknown) => {
    const record = asRecord(item);
    return {
      name: String(record?.name ?? ""),
      command: String(record?.command ?? ""),
    };
  });
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toStringArrayMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = toStringArray(entry);
  }
  return result;
}

function parseProjectListModePreference(value: unknown): ProjectListModePreference {
  const record = asRecord(value);
  return {
    projectOrderIds: toStringArray(record?.projectOrderIds),
    nodeOrderByParentId: toStringArrayMap(record?.nodeOrderByParentId),
    foldedProjectIds: toStringArray(record?.foldedProjectIds),
    foldedNodeKeys: toStringArray(record?.foldedNodeKeys),
  };
}

export function parseProjectListPreference(value: unknown): ProjectListPreference {
  const record = asRecord(value);
  return {
    version: typeof record?.version === "number" ? record.version : 1,
    by_project: parseProjectListModePreference(record?.by_project),
    by_node: parseProjectListModePreference(record?.by_node),
    workspaceOrderByParentId: toStringArrayMap(record?.workspaceOrderByParentId),
  };
}

export class DaemonProjectClient {
  private readonly invoke: InvokeFn;

  constructor(invoke: InvokeFn) {
    this.invoke = invoke;
  }

  async listByOrg(orgId: string, _opts?: { withWorkspaces?: boolean }): Promise<ProjectWithWorkspacesRecord[]> {
    const result = await this.invoke("project.listWithWorkspaces", { organizationId: orgId });
    if (!Array.isArray(result)) {
      return [];
    }
    return (result as unknown[]).map((item) => this.parseProjectWithWorkspaces(item));
  }

  async getListPreferences(orgId: string): Promise<ProjectListPreference> {
    const result = await this.invoke("project.getListPreferences", { organizationId: orgId });
    return parseProjectListPreference(result);
  }

  async setListPreferences(orgId: string, preferences: ProjectListPreference): Promise<{ ok: boolean }> {
    const result = await this.invoke("project.setListPreferences", { organizationId: orgId, preferences });
    const record = asRecord(result);
    return { ok: record?.ok === true };
  }

  private parseProjectWithWorkspaces(item: unknown): ProjectWithWorkspacesRecord {
    const record = asRecord(item);
    const workspaces = Array.isArray(record?.workspaces)
      ? (record.workspaces as DaemonWorkspacePayload[]).map((workspace) => this.parseWorkspace(workspace))
      : [];
    return {
      ...this.parseProject(item),
      workspaces,
    };
  }

  private parseProject(item: unknown): ProjectRecord {
    const record = asRecord(item);
    return {
      id: readOptionalString(record?.id) ?? "",
      name: readOptionalString(record?.name) ?? "",
      sourceType: toSourceType(readOptionalString(record?.sourceType)),
      repoProvider: readOptionalString(record?.repoProvider) ?? null,
      repoUrl: readOptionalString(record?.repoUrl) ?? null,
      repoKey: readOptionalString(record?.repoKey) ?? null,
      contextEnabled: readOptionalBoolean(record?.contextEnabled) ?? true,
      icon: readOptionalString(record?.icon) ?? "folder",
      color: readOptionalString(record?.color) ?? "#1E66F5",
      setupScript: readOptionalString(record?.setupScript) ?? "",
      postScript: readOptionalString(record?.postScript) ?? "",
      commands: toProjectCommands(record?.commands),
      organizationId: readOptionalString(record?.organizationId) ?? "",
      createdByUserId: readOptionalString(record?.createdByUserId) ?? "",
      createdAt: readOptionalString(record?.createdAt) ?? "",
      updatedAt: readOptionalString(record?.updatedAt) ?? "",
    };
  }

  private parseWorkspace(item: DaemonWorkspacePayload): WorkspaceRecord {
    const record = asRecord(item);
    return {
      id: readOptionalString(record?.id) ?? "",
      organizationId: readOptionalString(record?.organizationId) ?? "",
      projectId: readOptionalString(record?.projectId) ?? "",
      nodeId: readOptionalString(record?.nodeId) ?? "",
      kind: toWorkspaceKind(readOptionalString(record?.kind)),
      status: toWorkspaceStatus(readOptionalString(record?.status)),
      state: toWorkspaceLifecycleState(readOptionalString(record?.state)),
      health: toWorkspaceHealth(readOptionalString(record?.health)),
      branch: readOptionalString(record?.branch) ?? null,
      sourceBranch: readOptionalString(record?.sourceBranch) ?? null,
      localPath: readOptionalString(record?.localPath) ?? "",
      userId: "",
      latestPullRequest: null,
      createdAt: readOptionalString(record?.createdAt) ?? "",
      updatedAt: readOptionalString(record?.updatedAt) ?? "",
    };
  }
}

let cachedProjectRpc: DaemonProjectClient | null = null;

/**
 * Lazily resolves the project Domain RPC adapter over the root transport
 * (dependency direction: Domain RPC adapter → root RPC transport).
 */
export async function getProjectRpc(): Promise<DaemonProjectClient> {
  if (!cachedProjectRpc) {
    cachedProjectRpc = new DaemonProjectClient((await getDaemonTransport()).invoke);
  }
  return cachedProjectRpc;
}
