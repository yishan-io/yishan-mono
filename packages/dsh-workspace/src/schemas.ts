/** Common project and organization tool parameters. */
export const projectAndOrganizationParameters = {
  projectId: { type: "string", description: "Project id." },
  orgId: { type: "string", description: "Organization id." },
} as const;

/** Parameters for looking up one workspace. */
export const workspaceLookupParameters = {
  ...projectAndOrganizationParameters,
  workspaceId: { type: "string", description: "Workspace id." },
} as const;

/** Parameters for creating a workspace. */
export const workspaceCreateParameters = {
  ...projectAndOrganizationParameters,
  branch: { type: "string", required: true, description: "New worktree branch name." },
  sourceBranch: { type: "string", description: "Source branch used to create the worktree." },
  name: { type: "string", description: "Workspace name used for the local worktree path." },
  targetNode: { type: "string", description: "Optional target node id for workspace creation." },
  taskRunPrompt: { type: "string", description: "Optional short prompt for the launched agent." },
  taskRunModel: { type: "string", description: "Optional model override for the launched agent." },
} as const;

const workspaceRecordSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", required: true },
    organizationId: { type: "string" },
    projectId: { type: "string" },
    nodeId: { type: "string" },
    kind: { type: "string" },
    status: { type: "string" },
    branch: { type: "string" },
    sourceBranch: { type: "string" },
    localPath: { type: "string" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

/** Output schema for workspace listing. */
export const workspaceListOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    workspaces: { type: "array", required: true, items: workspaceRecordSchema },
  },
} as const;

/** Output schema for workspace lookup. */
export const workspaceFindOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    workspace: { ...workspaceRecordSchema, required: true },
    organizationId: { type: "string" },
    projectId: { type: "string" },
  },
} as const;

/** Output schema for workspace creation. */
export const workspaceCreateOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    workspaceId: { type: "string", required: true },
    localPath: { type: "string" },
    stdout: { type: "string", required: true },
  },
} as const;

/** Output schema for workspace closure. */
export const workspaceCloseOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    workspace: { ...workspaceRecordSchema, required: true },
  },
} as const;
