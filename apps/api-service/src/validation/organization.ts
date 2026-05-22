import { nonEmptyStringSchema, orgIdParamSchema } from "@/validation/common";
import { z } from "zod";

export const createOrganizationBodySchema = z.object({
  name: nonEmptyStringSchema,
  memberUserIds: z.array(nonEmptyStringSchema).optional().default([]),
});

export { orgIdParamSchema as organizationParamsSchema };

export const addOrganizationMemberBodySchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["member", "admin"]).optional().default("member"),
});

export const removeOrganizationMemberParamsSchema = orgIdParamSchema.extend({
  userId: nonEmptyStringSchema,
});

export const cancelOrganizationInviteParamsSchema = orgIdParamSchema.extend({
  inviteId: nonEmptyStringSchema,
});

export type CreateOrganizationBodyInput = z.infer<typeof createOrganizationBodySchema>;
export type OrganizationParamsInput = z.infer<typeof orgIdParamSchema>;
export type AddOrganizationMemberBodyInput = z.infer<typeof addOrganizationMemberBodySchema>;
export type RemoveOrganizationMemberParamsInput = z.infer<typeof removeOrganizationMemberParamsSchema>;
export type CancelOrganizationInviteParamsInput = z.infer<typeof cancelOrganizationInviteParamsSchema>;
