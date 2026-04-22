import { z } from "zod";
import { nonEmptyStringSchema } from "@/validation/common";

export const createOrganizationBodySchema = z.object({
  name: nonEmptyStringSchema,
  memberUserIds: z.array(nonEmptyStringSchema).optional().default([])
});

export const organizationParamsSchema = z.object({
  orgId: nonEmptyStringSchema
});

export const addOrganizationMemberBodySchema = z.object({
  userId: nonEmptyStringSchema,
  role: z.enum(["member", "admin"]).optional().default("member")
});

export const removeOrganizationMemberParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  userId: nonEmptyStringSchema
});

export type CreateOrganizationBodyInput = z.infer<typeof createOrganizationBodySchema>;
export type OrganizationParamsInput = z.infer<typeof organizationParamsSchema>;
export type AddOrganizationMemberBodyInput = z.infer<typeof addOrganizationMemberBodySchema>;
export type RemoveOrganizationMemberParamsInput = z.infer<
  typeof removeOrganizationMemberParamsSchema
>;
