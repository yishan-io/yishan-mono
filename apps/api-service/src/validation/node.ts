import { nonEmptyStringSchema } from "@/validation/common";
import { z } from "zod";
const nodeMetadataSchema = z
  .object({
    os: nonEmptyStringSchema.optional(),
    version: nonEmptyStringSchema.optional(),
  })
  .catchall(z.unknown());

export const organizationNodeParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
});

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

export const nodeRelayTokenParamsSchema = z.object({
  nodeId: nonEmptyStringSchema,
});

export type RegisterNodeBodyInput = z.infer<typeof registerNodeBodySchema>;
export type OrganizationNodeParamsInput = z.infer<typeof organizationNodeParamsSchema>;
export type OrganizationNodeDeleteParamsInput = z.infer<typeof organizationNodeDeleteParamsSchema>;
export type NodeRelayTokenParamsInput = z.infer<typeof nodeRelayTokenParamsSchema>;
