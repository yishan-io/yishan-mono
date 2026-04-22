import { z } from "zod";
import { nonEmptyStringSchema } from "@/validation/common";
const nodeMetadataSchema = z
  .object({
    os: nonEmptyStringSchema.optional(),
    version: nonEmptyStringSchema.optional()
  })
  .catchall(z.unknown());

export const nodeParamsSchema = z.object({
  nodeId: nonEmptyStringSchema
});

export const organizationNodeParamsSchema = z.object({
  orgId: nonEmptyStringSchema
});

export const organizationNodeDeleteParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  nodeId: nonEmptyStringSchema
});

export const createNodeBodySchema = z
  .object({
    name: nonEmptyStringSchema,
    scope: z.enum(["local", "remote"]),
    endpoint: nonEmptyStringSchema.optional(),
    metadata: nodeMetadataSchema.optional()
  });

export type NodeParamsInput = z.infer<typeof nodeParamsSchema>;
export type CreateNodeBodyInput = z.infer<typeof createNodeBodySchema>;
export type OrganizationNodeParamsInput = z.infer<typeof organizationNodeParamsSchema>;
export type OrganizationNodeDeleteParamsInput = z.infer<typeof organizationNodeDeleteParamsSchema>;
