import { z } from "zod";

const nonEmptyStringSchema = z.string().min(1);
const executionRequestSchema = z.object({
  cwd: nonEmptyStringSchema,
  sessionId: nonEmptyStringSchema,
});
const textPromptContentBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

/** Daemon-authorized policy persisted with one session binding. */
export const workspaceBindingPolicySchema = z
  .object({
    authorization: z.literal("daemon-authorized"),
  })
  .strict();

/** Durable session binding, including support for records written before policy was explicit. */
export const sessionBoundDataSchema = z
  .object({
    version: z.literal(1),
    workspaceId: nonEmptyStringSchema,
    projectId: z.string(),
    organizationId: z.string(),
    ownerNodeId: nonEmptyStringSchema,
    cwd: nonEmptyStringSchema,
    policy: workspaceBindingPolicySchema.optional().default({ authorization: "daemon-authorized" }),
  })
  .strict();

/** Request to start one session. */
export const sessionStartRequestSchema = executionRequestSchema.extend({
  binding: sessionBoundDataSchema,
  agentOptions: z
    .object({
      provider: nonEmptyStringSchema.optional(),
      model: nonEmptyStringSchema.optional(),
    })
    .optional(),
});

/** Text-only semantic prompt request. */
export const sessionPromptRequestSchema = executionRequestSchema.extend({
  contentBlocks: z.array(textPromptContentBlockSchema).min(1),
});

/** Request to change the model used by one live session. */
export const setModelRequestSchema = executionRequestSchema.extend({
  model: nonEmptyStringSchema,
  provider: nonEmptyStringSchema.optional(),
});

/** Request to cancel, flush, dispose, or read one session. */
export const sessionExecutionRequestSchema = executionRequestSchema;

/** Request to subscribe after one acknowledged sequence. */
export const sessionSubscribeRequestSchema = executionRequestSchema.extend({
  afterSeq: z.number().int().min(-1),
});

/** Request to resume one session in a workspace. */
export const sessionResumeRequestSchema = executionRequestSchema.extend({
  workspaceId: nonEmptyStringSchema,
});

/** Request to list sessions in one workspace directory. */
export const sessionListRequestSchema = z.object({ cwd: nonEmptyStringSchema });

/** Request to inspect one session lineage. */
export const sessionLineageRequestSchema = z.object({
  cwd: nonEmptyStringSchema,
  rootSessionId: nonEmptyStringSchema,
  mode: z.enum(["children", "descendants"]),
});

export type SessionExecutionRequest = z.infer<typeof sessionExecutionRequestSchema>;
export type SessionStartRequest = z.infer<typeof sessionStartRequestSchema>;
export type SessionPromptRequest = z.infer<typeof sessionPromptRequestSchema>;
export type SetModelRequest = z.infer<typeof setModelRequestSchema>;
export type SessionSubscribeRequest = z.infer<typeof sessionSubscribeRequestSchema>;
export type SessionResumeRequest = z.infer<typeof sessionResumeRequestSchema>;
export type SessionListRequest = z.infer<typeof sessionListRequestSchema>;
export type SessionLineageRequest = z.infer<typeof sessionLineageRequestSchema>;
export type SessionBoundData = z.infer<typeof sessionBoundDataSchema>;
export type WorkspaceBindingPolicy = z.infer<typeof workspaceBindingPolicySchema>;
export type TextPromptContentBlock = z.infer<typeof textPromptContentBlockSchema>;
