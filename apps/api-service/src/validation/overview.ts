import { z } from "zod";

import { nonEmptyStringSchema, orgIdParamSchema } from "@/validation/common";

export { orgIdParamSchema as overviewOrgParamsSchema };

export const OVERVIEW_TIME_RANGES = ["7d", "30d", "90d"] as const;
export type OverviewTimeRange = (typeof OVERVIEW_TIME_RANGES)[number];

export const OVERVIEW_GRANULARITIES = ["hour", "day"] as const;
export type OverviewGranularity = (typeof OVERVIEW_GRANULARITIES)[number];

export const overviewTokenUsageQuerySchema = z.object({
  range: z.enum(OVERVIEW_TIME_RANGES),
  projectId: nonEmptyStringSchema.optional(),
  granularity: z.enum(OVERVIEW_GRANULARITIES).optional().default("day"),
});

export const overviewModelBreakdownQuerySchema = z.object({
  range: z.enum(OVERVIEW_TIME_RANGES),
  projectId: nonEmptyStringSchema.optional(),
});

export const overviewAgentKindBreakdownQuerySchema = z.object({
  range: z.enum(OVERVIEW_TIME_RANGES),
  projectId: nonEmptyStringSchema.optional(),
});

export const overviewWorkspaceInsightsQuerySchema = z.object({
  projectId: nonEmptyStringSchema.optional(),
});

export type OverviewTokenUsageQueryInput = z.infer<typeof overviewTokenUsageQuerySchema>;
export type OverviewModelBreakdownQueryInput = z.infer<typeof overviewModelBreakdownQuerySchema>;
export type OverviewAgentKindBreakdownQueryInput = z.infer<typeof overviewAgentKindBreakdownQuerySchema>;
export type OverviewWorkspaceInsightsQueryInput = z.infer<typeof overviewWorkspaceInsightsQuerySchema>;
export type OverviewOrgParamsInput = z.infer<typeof orgIdParamSchema>;
