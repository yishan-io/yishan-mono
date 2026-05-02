import { z } from "zod";

import { nonEmptyStringSchema } from "@/validation/common";

export const organizationProjectParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
});

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

export const createProjectBodySchema = z.object({
  name: nonEmptyStringSchema,
  sourceTypeHint: z.enum(["unknown", "git-local", "git"]).optional(),
  repoUrl: nonEmptyStringSchema.optional(),
  nodeId: nonEmptyStringSchema.optional(),
  localPath: nonEmptyStringSchema.optional(),
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
  kind: z.enum(["primary", "worktree"]).optional().default("primary"),
  branch: nonEmptyStringSchema.optional(),
  sourceBranch: nonEmptyStringSchema.optional(),
  nodeId: nonEmptyStringSchema,
  localPath: nonEmptyStringSchema,
});

export const closeWorkspaceBodySchema = z.object({
  kind: z.enum(["primary", "worktree"]).optional().default("worktree"),
  branch: nonEmptyStringSchema.optional(),
  nodeId: nonEmptyStringSchema,
  localPath: nonEmptyStringSchema,
});

export type OrganizationProjectParamsInput = z.infer<typeof organizationProjectParamsSchema>;
export type OrganizationProjectListQueryInput = z.infer<typeof organizationProjectListQuerySchema>;
export type ProjectWorkspaceParamsInput = z.infer<typeof projectWorkspaceParamsSchema>;
export type CreateProjectBodyInput = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBodyInput = z.infer<typeof updateProjectBodySchema>;
export type CreateWorkspaceBodyInput = z.infer<typeof createWorkspaceBodySchema>;
export type CloseWorkspaceBodyInput = z.infer<typeof closeWorkspaceBodySchema>;
