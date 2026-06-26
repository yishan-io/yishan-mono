import { AGENT_KINDS } from "@yishan/core";
import { z } from "zod";

import { nonEmptyStringSchema, orgIdParamSchema } from "@/validation/common";

const attributionConfidenceSchema = z.enum(["exact", "prefix_match", "fallback_unknown"]);

export { orgIdParamSchema as tokenUsageOrgParamsSchema };

export const tokenUsageHourlyRowSchema = z.object({
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
  workspacePath: nonEmptyStringSchema,
  agentKind: z.enum(AGENT_KINDS),
  model: nonEmptyStringSchema,
  modelNormalized: nonEmptyStringSchema,
  bucketStartHourUtc: z.string().datetime(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cachedInputTokens: z.number().int().min(0),
  cachedWriteTokens: z.number().int().min(0),
  reasoningTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  eventCount: z.number().int().min(0),
  sessionCount: z.number().int().min(0),
  turnCount: z.number().int().min(0),
  toolCallCount: z.number().int().min(0),
  attributionConfidence: attributionConfidenceSchema,
  ingestedAt: z.string().datetime(),
  runId: nonEmptyStringSchema,
});

export const upsertTokenUsageHourlyBodySchema = z.object({
  rows: z.array(tokenUsageHourlyRowSchema).max(10_000),
});

export const tokenUsageHourlyQuerySchema = z.object({
  projectId: nonEmptyStringSchema.optional(),
  workspaceId: nonEmptyStringSchema.optional(),
  agentKind: z.enum(AGENT_KINDS).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(10_000).optional().default(1000),
});

export type TokenUsageOrgParamsInput = z.infer<typeof orgIdParamSchema>;
export type TokenUsageHourlyRowInput = z.infer<typeof tokenUsageHourlyRowSchema>;
export type UpsertTokenUsageHourlyBodyInput = z.infer<typeof upsertTokenUsageHourlyBodySchema>;
export type TokenUsageHourlyQueryInput = z.infer<typeof tokenUsageHourlyQuerySchema>;
