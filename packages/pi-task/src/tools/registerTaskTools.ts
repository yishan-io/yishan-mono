import { StringEnum } from "@earendil-works/pi-ai";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, type ExtensionAPI, truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  appendTaskNote,
  assertTaskDocument,
  assertTaskId,
  finishTask,
  listTasks,
  readTaskDocument,
  startTask,
  writeTaskDocument,
} from "./taskFiles";

const taskIdSchema = Type.String({ minLength: 1, maxLength: 60, pattern: "^[A-Za-z0-9-]{1,60}$" });
const dateSchema = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const documentSchema = StringEnum(["task", "notes", "plan", "outcome"] as const);
const statusSchema = StringEnum(["active", "completed"] as const);

/** Registers small, direct task-file tools for the active Pi project. */
export function registerTaskTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "task_start",
    label: "Start Task",
    description: "Create an active task folder, task.md, and state entry.",
    parameters: Type.Object(
      {
        title: Type.String({ minLength: 1, maxLength: 200 }),
        id: Type.Optional(taskIdSchema),
        ticket: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
        goal: Type.Optional(Type.String({ minLength: 1, maxLength: 10000 })),
        acceptanceCriteria: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 2000 }), { maxItems: 50 })),
        created: Type.Optional(dateSchema),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const task = await startTask(ctx.cwd, params);
      return result(`Started task ${task.id}.`, task);
    },
  });

  pi.registerTool({
    name: "task_list",
    label: "List Tasks",
    description: "List task entries from .my-context/tasks/state.json.",
    parameters: Type.Object({ status: Type.Optional(statusSchema) }, { additionalProperties: false }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const tasks = await listTasks(ctx.cwd, params.status);
      return result(
        tasks.map((task) => `${task.id} — ${task.status} — ${task.title}`).join("\n") || "No tasks found.",
        { tasks },
      );
    },
  });

  pi.registerTool({
    name: "task_read",
    label: "Read Task File",
    description: "Read one task markdown file by task ID and document name.",
    parameters: Type.Object(
      { id: taskIdSchema, document: Type.Optional(documentSchema) },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const document = params.document ?? "task";
      assertTaskId(params.id);
      assertTaskDocument(document);
      return result(await readTaskDocument(ctx.cwd, params.id, document), { id: params.id, document });
    },
  });

  pi.registerTool({
    name: "task_write",
    label: "Write Task File",
    description: "Replace one task markdown file by task ID and document name.",
    parameters: Type.Object(
      {
        id: taskIdSchema,
        document: documentSchema,
        content: Type.String({ minLength: 1, maxLength: 50000 }),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      await writeTaskDocument(ctx.cwd, params.id, params.document, params.content);
      return result(`Wrote ${params.document}.md for task ${params.id}.`, { id: params.id, document: params.document });
    },
  });

  pi.registerTool({
    name: "task_append_note",
    label: "Append Task Note",
    description: "Append one dated entry to a task's notes.md file.",
    parameters: Type.Object(
      { id: taskIdSchema, content: Type.String({ minLength: 1, maxLength: 50000 }), date: Type.Optional(dateSchema) },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      await appendTaskNote(ctx.cwd, params.id, params.content, params.date);
      return result(`Appended a note to task ${params.id}.`, { id: params.id });
    },
  });

  pi.registerTool({
    name: "task_finish",
    label: "Finish Task",
    description: "Write outcome.md and move an active task to its completed folder.",
    parameters: Type.Object(
      {
        id: taskIdSchema,
        outcome: Type.String({ minLength: 1, maxLength: 50000 }),
        completed: Type.Optional(dateSchema),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const task = await finishTask(ctx.cwd, params.id, params.outcome, params.completed);
      return result(`Finished task ${task.id}.`, task);
    },
  });
}

function result(
  text: string,
  details: Record<string, unknown>,
): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> } {
  const truncated = truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
  return {
    content: [{ type: "text", text: truncated.content }],
    details: { ...details, truncated: truncated.truncated },
  };
}
