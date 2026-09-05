import type { CapabilityRequest } from "@yishan-io/dsh-daemon-bridge";
import { z } from "zod";

export const taskStatusSchema = z.enum(["new", "progressing", "done", "cancelled"]);
export const taskUpdateStatusSchema = z.enum(["new", "progressing", "cancelled"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high"]);
export const taskDocumentSchema = z.enum(["task", "notes", "plan", "outcome"]);
export const writableTaskDocumentSchema = z.enum(["notes", "plan", "outcome"]);
const taskIdSchema = z.string().min(1);
const tagsSchema = z.array(z.string().min(1).max(64)).max(12);
const taskTagRefSchema = z.object({ id: z.string(), name: z.string().optional() });

export const localTaskSchema = z.object({
  id: taskIdSchema,
  projectId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  tags: z.array(z.string()),
  tagRefs: z.array(taskTagRefSchema),
});
export const localTaskSearchResultSchema = localTaskSchema.extend({ rank: z.number() });
export const taskTemplateSchema = z.object({ id: z.string(), name: z.string(), content: z.string() });

export const taskStartCapabilityInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10_000),
  priority: taskPrioritySchema.optional(),
  tags: tagsSchema.optional(),
  workspaceId: taskIdSchema.optional(),
});
const statusFilterSchema = z.union([taskStatusSchema, z.array(taskStatusSchema).min(1).max(4)]);
export const taskListInputSchema = z.object({
  status: statusFilterSchema.optional(),
  priority: taskPrioritySchema.optional(),
  workspaceId: taskIdSchema.optional(),
  tags: tagsSchema.optional(),
});
export const taskSearchInputSchema = taskListInputSchema.extend({ query: z.string().min(1).max(10_000) });
export const taskReadInputSchema = z.object({ id: taskIdSchema, document: taskDocumentSchema.optional() });
export const taskUpdateInputSchema = z.object({
  id: taskIdSchema,
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10_000).optional(),
  status: taskUpdateStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  tags: tagsSchema.optional(),
});
export const taskWriteInputSchema = z.object({
  id: taskIdSchema,
  document: writableTaskDocumentSchema,
  content: z.string().min(1).max(50_000),
});
export const taskAppendNoteInputSchema = z.object({ id: taskIdSchema, content: z.string().min(1).max(50_000) });
export const taskFinishInputSchema = z.object({ id: taskIdSchema, outcome: z.string().min(1).max(50_000) });

export const taskListResultSchema = z.object({ tasks: z.array(localTaskSchema) });
export const taskSearchResultSchema = z.object({ tasks: z.array(localTaskSearchResultSchema) });
export const taskReadResultSchema = z.discriminatedUnion("document", [
  z.object({ document: z.literal("task"), task: localTaskSchema }),
  z.object({ id: taskIdSchema, document: z.enum(["notes", "plan", "outcome"]), content: z.string() }),
]);
export const taskWriteResultSchema = z.object({ id: taskIdSchema, document: writableTaskDocumentSchema });
export const taskAppendNoteResultSchema = z.object({ id: taskIdSchema });
export const taskFinishResultSchema = z.object({ id: taskIdSchema, status: z.literal("done") });
export const taskTemplatesResultSchema = z.object({
  templates: z.array(taskTemplateSchema),
  agentDefaultId: z.string(),
});

export type LocalTask = z.infer<typeof localTaskSchema>;
export type LocalTaskSearchResult = z.infer<typeof localTaskSearchResultSchema>;
export type TaskListInput = z.infer<typeof taskListInputSchema>;
export type TaskListResult = z.infer<typeof taskListResultSchema>;
export type TaskSearchInput = z.infer<typeof taskSearchInputSchema>;
export type TaskSearchResult = z.infer<typeof taskSearchResultSchema>;
export type TaskReadInput = z.infer<typeof taskReadInputSchema>;
export type TaskReadResult = z.infer<typeof taskReadResultSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateInputSchema>;
export type TaskWriteInput = z.infer<typeof taskWriteInputSchema>;
export type TaskWriteResult = z.infer<typeof taskWriteResultSchema>;
export type TaskAppendNoteInput = z.infer<typeof taskAppendNoteInputSchema>;
export type TaskAppendNoteResult = z.infer<typeof taskAppendNoteResultSchema>;
export type TaskFinishInput = z.infer<typeof taskFinishInputSchema>;
export type TaskFinishResult = z.infer<typeof taskFinishResultSchema>;
export type TaskTemplatesResult = z.infer<typeof taskTemplatesResultSchema>;

type TaskOperation =
  | "task.start"
  | "task.list"
  | "task.search"
  | "task.read"
  | "task.update"
  | "task.write"
  | "task.appendNote"
  | "task.finish"
  | "task.templateRead";
type TaskCapabilityInput =
  | z.infer<typeof taskStartCapabilityInputSchema>
  | TaskListInput
  | TaskSearchInput
  | TaskReadInput
  | TaskUpdateInput
  | TaskWriteInput
  | TaskAppendNoteInput
  | TaskFinishInput
  | Record<string, never>;
export type TaskCapabilityRequest = CapabilityRequest<TaskOperation, TaskCapabilityInput>;
