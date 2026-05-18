import { z } from "zod";

export const nonEmptyStringSchema = z.string().trim().min(1);

/** Shared params schema for any route that identifies an organization by ID. */
export const orgIdParamSchema = z.object({
  orgId: nonEmptyStringSchema,
});

export type OrgIdParamInput = z.infer<typeof orgIdParamSchema>;
