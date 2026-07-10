import { nonEmptyStringSchema, orgIdParamSchema } from "@/validation/common";
import { z } from "zod";

export { orgIdParamSchema as organizationProjectParamsSchema };
export type OrganizationProjectParamsInput = z.infer<typeof orgIdParamSchema>;
export const projectWorkspaceParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
});

export const organizationProjectListQuerySchema = z.object({
  withWorkspaces: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const createProjectBodySchema = z
  .object({
    name: nonEmptyStringSchema,
    sourceTypeHint: z.enum(["unknown", "git-local", "git"]).optional(),
    repoUrl: nonEmptyStringSchema.optional(),
    nodeId: nonEmptyStringSchema.optional(),
    localPath: nonEmptyStringSchema.optional(),
    contextEnabled: z.boolean().optional(),
  })
  .refine((input) => !(input.localPath && input.sourceTypeHint === "unknown"), {
    message:
      "sourceTypeHint must be 'git' or 'git-local' when a local path is provided — the folder must be a git repository",
  });

export const updateProjectBodySchema = z
  .object({
    name: nonEmptyStringSchema.optional(),
    icon: nonEmptyStringSchema.optional(),
    color: nonEmptyStringSchema.optional(),
    setupScript: z.string().optional(),
    postScript: z.string().optional(),
    commands: z
      .array(
        z.object({
          name: nonEmptyStringSchema,
          command: nonEmptyStringSchema,
        }),
      )
      .optional(),
    contextEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one field must be provided",
  });

export const createWorkspaceBodySchema = z.object({
  id: nonEmptyStringSchema.optional(),
  kind: z.enum(["primary", "worktree"]).optional().default("primary"),
  name: nonEmptyStringSchema.optional(),
  branch: nonEmptyStringSchema.optional(),
  sourceBranch: nonEmptyStringSchema.optional(),
  nodeId: nonEmptyStringSchema,
  localPath: nonEmptyStringSchema.optional(),
  sourceNodeId: nonEmptyStringSchema.optional(),
});

export const closeWorkspaceBodySchema = z.object({
  workspaceId: nonEmptyStringSchema,
  source: z.enum(["daemon"]).optional(),
  sourceNodeId: nonEmptyStringSchema.optional(),
});

export const workspaceTerminalParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
});

export const updateWorkspaceParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
});

export const workspaceTerminalSessionParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
  sessionId: nonEmptyStringSchema,
});

export const workspaceTerminalListQuerySchema = z.object({
  includeExited: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const workspaceTerminalStartBodySchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  paneId: nonEmptyStringSchema.optional(),
  tabId: nonEmptyStringSchema.optional(),
});

export const workspaceFileListParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
});

export const workspaceFileListQuerySchema = z.object({
  path: z.string().default(""),
  recursive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const workspaceFileReadParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
});

export const workspaceFileReadQuerySchema = z.object({
  path: nonEmptyStringSchema,
  maxChars: z.coerce.number().int().positive().optional(),
});

export const workspaceFileDiffParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
});

export const workspaceFileDiffQuerySchema = z.object({
  path: nonEmptyStringSchema,
  maxChars: z.coerce.number().int().positive().optional(),
});

export const workspaceGitChangesParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
});

export const workspaceGitBranchesParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
});

export const updateWorkspaceBodySchema = z.object({
  localPath: nonEmptyStringSchema,
  sourceNodeId: nonEmptyStringSchema.optional(),
});

export const workspacePullRequestParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
});

export const upsertWorkspacePullRequestBodySchema = z.object({
  prId: nonEmptyStringSchema,
  title: z.string().optional(),
  url: z.string().optional(),
  branch: z.string().optional(),
  baseBranch: z.string().optional(),
  state: z.enum(["open", "closed", "merged"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  detectedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
});

export type OrganizationProjectListQueryInput = z.infer<typeof organizationProjectListQuerySchema>;
export type ProjectWorkspaceParamsInput = z.infer<typeof projectWorkspaceParamsSchema>;
export type CreateProjectBodyInput = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBodyInput = z.infer<typeof updateProjectBodySchema>;
export type CreateWorkspaceBodyInput = z.infer<typeof createWorkspaceBodySchema>;
export type CloseWorkspaceBodyInput = z.infer<typeof closeWorkspaceBodySchema>;
export type WorkspaceTerminalParamsInput = z.infer<typeof workspaceTerminalParamsSchema>;
export type WorkspaceTerminalSessionParamsInput = z.infer<typeof workspaceTerminalSessionParamsSchema>;
export type WorkspaceTerminalListQueryInput = z.infer<typeof workspaceTerminalListQuerySchema>;
export type WorkspaceTerminalStartBodyInput = z.infer<typeof workspaceTerminalStartBodySchema>;
export type WorkspaceFileListParamsInput = z.infer<typeof workspaceFileListParamsSchema>;
export type WorkspaceFileListQueryInput = z.infer<typeof workspaceFileListQuerySchema>;
export type WorkspaceFileReadParamsInput = z.infer<typeof workspaceFileReadParamsSchema>;
export type WorkspaceFileReadQueryInput = z.infer<typeof workspaceFileReadQuerySchema>;
export type WorkspaceFileDiffParamsInput = z.infer<typeof workspaceFileDiffParamsSchema>;
export type WorkspaceFileDiffQueryInput = z.infer<typeof workspaceFileDiffQuerySchema>;
export type WorkspaceGitChangesParamsInput = z.infer<typeof workspaceGitChangesParamsSchema>;
export type WorkspaceGitBranchesParamsInput = z.infer<typeof workspaceGitBranchesParamsSchema>;
export type UpdateWorkspaceParamsInput = z.infer<typeof updateWorkspaceParamsSchema>;
export type UpdateWorkspaceBodyInput = z.infer<typeof updateWorkspaceBodySchema>;
export type WorkspacePullRequestParamsInput = z.infer<typeof workspacePullRequestParamsSchema>;
export type UpsertWorkspacePullRequestBodyInput = z.infer<typeof upsertWorkspacePullRequestBodySchema>;
