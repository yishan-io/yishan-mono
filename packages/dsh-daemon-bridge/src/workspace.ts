import { CapabilityClient, type CapabilityIdentity, type CapabilityRequest } from "./capabilityClient";

/** One workspace returned by the workspace domain. */
export interface WorkspaceRecord {
  id: string;
  organizationId?: string;
  projectId?: string;
  nodeId?: string;
  kind?: string;
  status?: string;
  branch?: string;
  sourceBranch?: string;
  localPath?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Input for listing workspaces. */
export interface WorkspaceListInput {
  projectId?: string;
  orgId?: string;
}

/** Result of listing workspaces. */
export interface WorkspaceListResult {
  workspaces: WorkspaceRecord[];
}

/** Input for finding one workspace. */
export interface WorkspaceFindInput {
  projectId?: string;
  workspaceId?: string;
  orgId?: string;
}

/** Result of finding one workspace. */
export interface WorkspaceFindResult {
  workspace: WorkspaceRecord;
  organizationId?: string;
  projectId?: string;
}

/** Input for creating a workspace. */
export interface WorkspaceCreateInput {
  projectId?: string;
  orgId?: string;
  branch: string;
  sourceBranch?: string;
  name?: string;
  targetNode?: string;
  taskRunPrompt?: string;
  taskRunModel?: string;
}

/** Result of creating a workspace. */
export interface WorkspaceCreateResult {
  workspaceId: string;
  localPath?: string;
  stdout: string;
}

/** Input for closing a workspace. */
export interface WorkspaceCloseInput {
  projectId?: string;
  workspaceId?: string;
  orgId?: string;
}

/** Result of closing a workspace. */
export interface WorkspaceCloseResult {
  workspace: WorkspaceRecord;
}

/** Narrow execution facts required to create a workspace capability client. */
export interface WorkspaceCapabilityExecution {
  agent?: { id: string };
  signal: AbortSignal;
}

/** Daemon-authorized identity required for one workspace capability request. */
export type WorkspaceCapabilityIdentity = CapabilityIdentity;

type WorkspaceCapabilityOperation = "workspace.list" | "workspace.find" | "workspace.create" | "workspace.close";
type WorkspaceCapabilityInput = WorkspaceListInput | WorkspaceFindInput | WorkspaceCreateInput | WorkspaceCloseInput;

/** A workspace capability request sent over the daemon bridge. */
export type WorkspaceCapabilityRequest = CapabilityRequest<WorkspaceCapabilityOperation, WorkspaceCapabilityInput>;

/** Narrow daemon transport used exclusively for workspace capability requests. */
export interface WorkspaceCapabilityTransport {
  requestWorkspaceCapability(request: WorkspaceCapabilityRequest): Promise<unknown>;
}

/** Resolves daemon-authorized workspace identity for a live DSH session. */
export type WorkspaceCapabilityIdentityResolver = (sessionId: string) => WorkspaceCapabilityIdentity;

/** Resolves a concrete workspace capability client for a DSH tool execution. */
export type WorkspaceCapabilityClientResolver = (execution: WorkspaceCapabilityExecution) => WorkspaceCapabilityClient;

/** Creates workspace clients bound to the agent that initiated each tool execution. */
export function createWorkspaceClientResolver(
  transport: WorkspaceCapabilityTransport,
  resolveIdentity: WorkspaceCapabilityIdentityResolver,
): WorkspaceCapabilityClientResolver {
  return (execution) => {
    const sessionId = execution.agent?.id;
    if (sessionId === undefined) throw new Error("workspace tools require an agent-scoped execution");
    return new WorkspaceCapabilityClient(transport, resolveIdentity(sessionId), execution.signal);
  };
}

/** Sends workspace lifecycle requests through the daemon capability transport. */
export class WorkspaceCapabilityClient {
  private readonly client: CapabilityClient<WorkspaceCapabilityOperation, WorkspaceCapabilityInput>;

  constructor(transport: WorkspaceCapabilityTransport, identity: WorkspaceCapabilityIdentity, signal: AbortSignal) {
    this.client = new CapabilityClient(
      { requestCapability: async (request) => await transport.requestWorkspaceCapability(request) },
      identity,
      signal,
      "workspace",
    );
  }

  /** Lists workspaces. */
  async list(input: WorkspaceListInput): Promise<WorkspaceListResult> {
    return await this.client.request("workspace.list", input);
  }

  /** Finds one workspace. */
  async find(input: WorkspaceFindInput): Promise<WorkspaceFindResult> {
    return await this.client.request("workspace.find", input);
  }

  /** Creates one workspace. */
  async create(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult> {
    return await this.client.request("workspace.create", input);
  }

  /** Closes one workspace. */
  async close(input: WorkspaceCloseInput): Promise<WorkspaceCloseResult> {
    return await this.client.request("workspace.close", input);
  }
}
