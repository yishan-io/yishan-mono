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
    contextEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one field must be provided",
  });

export const createWorkspaceBodySchema = z.object({
  id: nonEmptyStringSchema.optional(),
  kind: z.enum(["primary", "worktree"]).optional().default("primary"),
  branch: nonEmptyStringSchema.optional(),
  sourceBranch: nonEmptyStringSchema.optional(),
  nodeId: nonEmptyStringSchema,
  localPath: nonEmptyStringSchema,
});

export const closeWorkspaceBodySchema = z.object({
  workspaceId: nonEmptyStringSchema,
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
export type WorkspacePullRequestParamsInput = z.infer<typeof workspacePullRequestParamsSchema>;
export type UpsertWorkspacePullRequestBodyInput = z.infer<typeof upsertWorkspacePullRequestBodySchema>;
