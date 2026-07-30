import { z } from "zod";

export { orgIdParamSchema as organizationExportOrgParamsSchema } from "@/validation/common";

import type { OrgIdParamInput } from "@/validation/common";

export const organizationExportQuerySchema = z.object({
  type: z.enum(["project", "workspace", "usage"]),
});

/** Route params for organization export endpoints. */
export type OrganizationExportOrgParamsInput = OrgIdParamInput;
export type OrganizationExportQueryInput = z.infer<typeof organizationExportQuerySchema>;
