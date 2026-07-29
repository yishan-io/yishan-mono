import type { ProjectRecord, ProjectWithWorkspacesRecord, WorkspaceRecord } from "../api";
import { asRecord, readOptionalBoolean, readOptionalString, readOptionalStringArray } from "./helpers";

type InvokeFn = (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>;

type DaemonWorkspacePayload = Record<string, unknown>;

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

  async create(
    orgId: string,
    input: {
      name: string;
      sourceTypeHint?: string;
      repoUrl?: string;
      nodeId?: string;
      localPath?: string;
      contextEnabled?: boolean;
    },
  ): Promise<ProjectWithWorkspacesRecord> {
    const result = await this.invoke("project.create", {
      name: input.name?.trim() ?? "",
      organizationId: orgId,
      sourceType: input.sourceTypeHint,
      repoUrl: input.repoUrl?.trim() || undefined,
    });
    const record = asRecord(result);
    return {
      id: readOptionalString(record?.id) ?? "",
      name: readOptionalString(record?.name) ?? "",
      sourceType: readOptionalString(record?.sourceType) ?? "unknown",
      repoProvider: readOptionalString(record?.repoProvider) ?? null,
      repoUrl: readOptionalString(record?.repoUrl) ?? null,
      repoKey: readOptionalString(record?.repoKey) ?? null,
      contextEnabled: readOptionalBoolean(record?.contextEnabled) ?? true,
      icon: readOptionalString(record?.icon) ?? "folder",
      color: readOptionalString(record?.color) ?? "#1E66F5",
      setupScript: readOptionalString(record?.setupScript) ?? "",
      postScript: readOptionalString(record?.postScript) ?? "",
      commands: readOptionalStringArray(record?.commands) ?? [],
      organizationId: readOptionalString(record?.organizationId) ?? orgId,
      createdByUserId: readOptionalString(record?.createdByUserId) ?? null,
      createdAt: readOptionalString(record?.createdAt) ?? "",
      updatedAt: readOptionalString(record?.updatedAt) ?? "",
      workspaces: [],
    };
  }

  async update(
    orgId: string,
    projectId: string,
    config: {
      name?: string;
      icon?: string;
      color?: string;
      setupScript?: string;
      postScript?: string;
      commands?: Array<{ name: string; command: string }>;
      contextEnabled?: boolean;
    },
  ): Promise<ProjectRecord> {
    const result = await this.invoke("project.update", {
      id: projectId,
      name: config.name,
      icon: config.icon,
      color: config.color,
      setupScript: config.setupScript,
      postScript: config.postScript,
      commands: config.commands,
      contextEnabled: config.contextEnabled,
    });
    return this.parseProject(result);
  }

  async delete(orgId: string, projectId: string): Promise<void> {
    await this.invoke("project.delete", { id: projectId });
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
      sourceType: readOptionalString(record?.sourceType) ?? "unknown",
      repoProvider: readOptionalString(record?.repoProvider) ?? null,
      repoUrl: readOptionalString(record?.repoUrl) ?? null,
      repoKey: readOptionalString(record?.repoKey) ?? null,
      contextEnabled: readOptionalBoolean(record?.contextEnabled) ?? true,
      icon: readOptionalString(record?.icon) ?? "folder",
      color: readOptionalString(record?.color) ?? "#1E66F5",
      setupScript: readOptionalString(record?.setupScript) ?? "",
      postScript: readOptionalString(record?.postScript) ?? "",
      commands: readOptionalStringArray(record?.commands) ?? [],
      organizationId: readOptionalString(record?.organizationId) ?? "",
      createdByUserId: readOptionalString(record?.createdByUserId) ?? null,
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
      kind: readOptionalString(record?.kind) ?? "worktree",
      status: readOptionalString(record?.status) ?? "active",
      branch: readOptionalString(record?.branch) ?? null,
      sourceBranch: readOptionalString(record?.sourceBranch) ?? null,
      localPath: readOptionalString(record?.localPath) ?? "",
      createdAt: readOptionalString(record?.createdAt) ?? "",
      updatedAt: readOptionalString(record?.updatedAt) ?? "",
    };
  }
}
