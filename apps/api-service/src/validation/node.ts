import { nonEmptyStringSchema, orgIdParamSchema } from "@/validation/common";
import { z } from "zod";

const nodeMetadataSchema = z
  .object({
    os: nonEmptyStringSchema.optional(),
    version: nonEmptyStringSchema.optional(),
  })
  .catchall(z.unknown());

/** Shared node params schema for any route that identifies a single node by ID. */
export const nodeParamsSchema = z.object({
  nodeId: nonEmptyStringSchema,
});

export { orgIdParamSchema as organizationNodeParamsSchema };

export const organizationNodeDeleteParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  nodeId: nonEmptyStringSchema,
});

export const registerNodeBodySchema = z.object({
  nodeId: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  scope: z.enum(["private", "shared"]),
  endpoint: nonEmptyStringSchema.optional(),
  metadata: nodeMetadataSchema.optional(),
  updateIfExists: z.boolean().optional(),
});

export type NodeParamsInput = z.infer<typeof nodeParamsSchema>;
export type RegisterNodeBodyInput = z.infer<typeof registerNodeBodySchema>;
export type OrganizationNodeParamsInput = z.infer<typeof orgIdParamSchema>;
export type OrganizationNodeDeleteParamsInput = z.infer<typeof organizationNodeDeleteParamsSchema>;
