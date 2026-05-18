import { AGENT_KINDS } from "@yishan/core";
import { z } from "zod";

import { nonEmptyStringSchema, orgIdParamSchema } from "@/validation/common";
import { nodeParamsSchema } from "@/validation/node";

const scheduledAgentKindSchema = z.enum(AGENT_KINDS);

export { orgIdParamSchema as scheduledJobOrgParamsSchema };

export const scheduledJobParamsSchema = z.object({
  orgId: nonEmptyStringSchema,
  jobId: nonEmptyStringSchema,
});

export const scheduledJobListQuerySchema = z.object({
  projectId: nonEmptyStringSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const scheduledJobRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const createScheduledJobBodySchema = z.object({
  name: nonEmptyStringSchema.max(120),
  projectId: nonEmptyStringSchema,
  nodeId: nonEmptyStringSchema,
  agentKind: scheduledAgentKindSchema.optional(),
  prompt: nonEmptyStringSchema.max(4096),
  model: nonEmptyStringSchema.max(120).optional(),
  command: nonEmptyStringSchema.max(2048).optional(),
  cronExpression: nonEmptyStringSchema.max(120),
  timezone: nonEmptyStringSchema.max(120).optional(),
});

export const updateScheduledJobBodySchema = z
  .object({
    name: nonEmptyStringSchema.max(120).optional(),
    nodeId: nonEmptyStringSchema.optional(),
    agentKind: scheduledAgentKindSchema.optional(),
    prompt: nonEmptyStringSchema.max(4096).optional(),
    model: nonEmptyStringSchema.max(120).nullable().optional(),
    command: nonEmptyStringSchema.max(2048).nullable().optional(),
    cronExpression: nonEmptyStringSchema.max(120).optional(),
    timezone: nonEmptyStringSchema.max(120).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one field must be provided",
  });

export type ScheduledJobOrgParamsInput = z.infer<typeof orgIdParamSchema>;
export type ScheduledJobParamsInput = z.infer<typeof scheduledJobParamsSchema>;
export type ScheduledJobListQueryInput = z.infer<typeof scheduledJobListQuerySchema>;
export type ScheduledJobRunsQueryInput = z.infer<typeof scheduledJobRunsQuerySchema>;
export type CreateScheduledJobBodyInput = z.infer<typeof createScheduledJobBodySchema>;
export type UpdateScheduledJobBodyInput = z.infer<typeof updateScheduledJobBodySchema>;

/** Re-export from validation/node for routes that validate a node-scoped run endpoint. */
export { nodeParamsSchema as nodeScheduledJobParamsSchema };
export type NodeScheduledJobParamsInput = z.infer<typeof nodeParamsSchema>;

export const startScheduledJobRunBodySchema = z.object({
  runId: nonEmptyStringSchema,
  startedAt: z.string().datetime().optional(),
});

export const completeScheduledJobRunBodySchema = z.object({
  runId: nonEmptyStringSchema,
  finishedAt: z.string().datetime().optional(),
  status: z.enum(["succeeded", "failed"]),
  responseBody: z.string().max(4096).optional(),
  errorCode: z.string().max(120).optional(),
  errorMessage: z.string().max(1000).optional(),
  errorDetails: z.record(z.string(), z.unknown()).optional(),
});

export type StartScheduledJobRunBodyInput = z.infer<typeof startScheduledJobRunBodySchema>;
export type CompleteScheduledJobRunBodyInput = z.infer<typeof completeScheduledJobRunBodySchema>;
