/**
 * One Yishan workspace record returned by CLI JSON output.
 */
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

/**
 * Input for listing workspaces.
 */
export interface WorkspaceListInput {
  projectId?: string;
  orgId?: string;
}

/**
 * JSON result for `yishan workspace list --output json`.
 */
export interface WorkspaceListResult {
  workspaces: WorkspaceRecord[];
}

/**
 * Input for looking up one workspace.
 */
export interface WorkspaceFindInput {
  projectId?: string;
  workspaceId?: string;
  orgId?: string;
}

/**
 * JSON result for `yishan workspace find --output json`.
 */
export interface WorkspaceFindResult {
  workspace: WorkspaceRecord;
  organizationId?: string;
  projectId?: string;
}

/**
 * Input for creating a worktree workspace.
 */
export interface WorkspaceCreateInput {
  projectId?: string;
  orgId?: string;
  branch: string;
  sourceBranch?: string;
  name?: string;
  targetNode?: string;
  taskRunAgentKind?: string;
  taskRunPrompt?: string;
  taskRunModel?: string;
}

/**
 * Parsed result for `yishan workspace create`.
 */
export interface WorkspaceCreateResult {
  workspaceId: string;
  localPath?: string;
  stdout: string;
}

/**
 * Input for closing a workspace.
 */
export interface WorkspaceCloseInput {
  projectId?: string;
  workspaceId?: string;
  orgId?: string;
}

/**
 * JSON result for `yishan workspace close --output json`.
 */
export interface WorkspaceCloseResult {
  workspace: WorkspaceRecord;
}

/**
 * Backend client interface for Pi workspace tools.
 */
export interface WorkspaceBackendClient {
  list(input: WorkspaceListInput): Promise<WorkspaceListResult>;
  find(input: WorkspaceFindInput): Promise<WorkspaceFindResult>;
  create(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult>;
  close(input: WorkspaceCloseInput): Promise<WorkspaceCloseResult>;
}
