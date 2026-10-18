import type { WorkspaceRecord } from "@renderer/domains/workspace";
import { PreferencesClient, preferencesClient, request } from "@renderer/rpc";
import { asRecord, readOptionalBoolean, readOptionalString } from "@shared/validation/primitiveReaders";
import type { ProjectCommandRecord, ProjectRecord, ProjectWithWorkspacesRecord } from "../api/types";

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

/** Parses current and legacy navigator hints without interpreting unknown versions. */
export function parseProjectListPreference(value: unknown): ProjectListPreference {
  const candidate = asRecord(value);
  const record =
    candidate?.version === undefined || candidate.version === 0 || candidate.version === 1 ? candidate : undefined;
  const legacyProject = asRecord(record?.by_project);
  const legacyNode = asRecord(record?.by_node);
  return {
    version: 1,
    by_project: parseProjectListModePreference(record?.by_project),
    by_node: parseProjectListModePreference(record?.by_node),
    workspaceOrderByParentId:
      record?.workspaceOrderByParentId == null
        ? {
            ...toStringArrayMap(legacyProject?.workspaceOrderByParentId),
            ...toStringArrayMap(legacyNode?.workspaceOrderByParentId),
          }
        : toStringArrayMap(record.workspaceOrderByParentId),
  };
}

export class DaemonProjectClient {
  private readonly invoke: InvokeFn;
  private readonly preferences: PreferencesClient;

  constructor(invoke: InvokeFn) {
    this.invoke = invoke;
    this.preferences = new PreferencesClient(invoke);
  }

  async listByOrg(orgId: string, _opts?: { withWorkspaces?: boolean }): Promise<ProjectWithWorkspacesRecord[]> {
    const result = await this.invoke("project.listWithWorkspaces", { organizationId: orgId });
    if (!Array.isArray(result)) {
      return [];
    }
    return (result as unknown[]).map((item) => this.parseProjectWithWorkspaces(item));
  }

  async getListPreferences(orgId: string): Promise<ProjectListPreference> {
    const response = await this.preferences.get(orgId, "project.navigator");
    const version = response.found ? asRecord(response.value)?.version : undefined;
    if (typeof version === "number" && version !== 0 && version !== 1) {
      throw new TypeError("Unsupported navigator preference version");
    }
    return parseProjectListPreference(response.found ? response.value : undefined);
  }

  async setListPreferences(orgId: string, preferences: ProjectListPreference): Promise<ProjectListPreference> {
    if (preferences.version !== 1) throw new TypeError("Unsupported navigator preference version");
    const response = await this.preferences.set(orgId, "project.navigator", preferences);
    return parseProjectListPreference(response.value);
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
      taskPrefix: readOptionalString(record?.taskPrefix) ?? null,
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
    cachedProjectRpc = new DaemonProjectClient(request);
  }
  return cachedProjectRpc;
}

/** Loads one organization's projects with their workspaces from the daemon. */
export async function listProjectsByOrg(
  organizationId: string,
  opts?: { withWorkspaces?: boolean },
): Promise<ProjectWithWorkspacesRecord[]> {
  const projectRpc = await getProjectRpc();
  return await projectRpc.listByOrg(organizationId, opts);
}

/** Loads one organization's project-list order/fold preferences from the daemon. */
export async function getProjectListPreferences(organizationId: string): Promise<ProjectListPreference> {
  const projectRpc = await getProjectRpc();
  return projectRpc.getListPreferences(organizationId);
}

/** Persists one organization's project-list order/fold preferences to the daemon. */
export async function setProjectListPreferences(
  organizationId: string,
  preferences: ProjectListPreference,
): Promise<ProjectListPreference> {
  const projectRpc = await getProjectRpc();
  return projectRpc.setListPreferences(organizationId, preferences);
}

/** Reads the default workspace worktree location from backend app settings. */
export async function getDefaultWorktreeLocation(): Promise<string> {
  const response = (await request("app.getDefaultWorktreeLocation", {})) as { worktreePath: string };
  return response.worktreePath;
}

/** SQLite filter state; initialization is distinct from an absent/default list. */
export type ProjectFilterPreference = { isInitialized: boolean; displayProjectIds?: string[] };

function parseProjectFilterPreference(payload: unknown): ProjectFilterPreference {
  const record = asRecord(payload);
  if (
    typeof record?.isInitialized !== "boolean" ||
    (record.displayProjectIds !== undefined &&
      (!Array.isArray(record.displayProjectIds) || !record.displayProjectIds.every((id) => typeof id === "string")))
  ) {
    throw new Error("Invalid project filter preference response");
  }
  return {
    isInitialized: record.isInitialized,
    displayProjectIds: record.displayProjectIds === undefined ? undefined : toStringArray(record.displayProjectIds),
  };
}

/** Reads the separate SQLite filter scope, never order/fold state. */
export async function loadProjectFilterPreference(organizationId: string): Promise<ProjectFilterPreference> {
  const response = await preferencesClient.get(organizationId, "project.filter");
  return response.found ? parseProjectFilterPreference(response.value) : { isInitialized: false };
}

/** Writes or atomically initializes only the SQLite filter scope. */
export async function saveProjectFilterPreference(
  organizationId: string,
  displayProjectIds: string[] | undefined,
  initializeOnly = false,
): Promise<ProjectFilterPreference> {
  const response = await preferencesClient.set(
    organizationId,
    "project.filter",
    { isInitialized: true, ...(displayProjectIds === undefined ? {} : { displayProjectIds }) },
    initializeOnly,
  );
  const preference = parseProjectFilterPreference(response.value);
  if (!preference.isInitialized) throw new Error("Project filter write was not acknowledged");
  return preference;
}
